#!/usr/bin/env python3
"""
Script to automatically remove district_ward related code from frontend files.
This handles TypeScript/React files.
"""
import os
import re
from pathlib import Path

def remove_district_lines(content, filename):
    """Remove lines containing district_ward or related patterns."""
    lines = content.split('\n')
    result_lines = []
    skip_next = False
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Skip lines with district_ward declarations
        if 'district_ward' in line.lower() and ('?' in line or ':' in line):
            print(f"  Removed: {line.strip()}")
            i += 1
            continue
            
        # Skip state declarations for district
        if ('tempDistrict' in line or 'selectedDistrict' in line or 
            'filterDistrict' in line or 'formDistrict' in line or
            'regionDistricts' in line or 'province_districts' in line or
            'region_districts' in line):
            print(f"  Removed: {line.strip()}")
            i += 1
            continue
        
        # Skip filter logic
        if 'selectedDistrict' in line and 'filter' in line.lower():
            print(f"  Removed: {line.strip()}")
            # Also skip return false on next line if exists
            if i + 1 < len(lines) and 'return false' in lines[i + 1]:
                i += 2
                continue
            i += 1
            continue
        
        # Skip district in dependency arrays
        if 'selectedDistrict' in line and ('], [' in line or 'useMemo' in content[max(0, content.find(line)-200):content.find(line)]):
            # Just remove the selectedDistrict part
            line = line.replace(', selectedDistrict', '').replace('selectedDistrict, ', '').replace('selectedDistrict', '')
            if line.strip() == '}, [items, ]);':
                line = line.replace(', ]', ']')
        
        # Skip Phường/Xã UI sections (multi-line blocks)
        if 'Phường/Xã' in line or 'phường/xã' in line:
            # Find the enclosing div/section
            if '<div' in line or '<label' in line:
                print(f"  Removing Phường/Xã UI block starting at: {line.strip()}")
                # Skip until we find the closing tag
                depth = line.count('<div') - line.count('</div')
                i += 1
                while i < len(lines) and depth > 0:
                    depth += lines[i].count('<div') - lines[i].count('</div')
                    i += 1
                continue
            else:
                # Single line reference
                print(f"  Removed: {line.strip()}")
                i += 1
                continue
        
        # Skip table headers for Phường/Xã
        if '<th' in line and 'Phường' in lines[i-1] if i > 0 else False:
            print(f"  Removed: {line.strip()}")
            i += 1
            continue
            
        result_lines.append(line)
        i += 1
    
    return '\n'.join(result_lines)

def process_file(filepath):
    """Process a single TypeScript/React file."""
    print(f"\nProcessing: {filepath}")
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Remove district_ward related code
        content = remove_district_lines(content, filepath)
        
        # Additional regex-based replacements
        # Remove from interfaces/types
        content = re.sub(r'\s*district_ward\?:\s*string\s*\|\s*null;', '', content)
        content = re.sub(r'\s*district\?:\s*string;', '', content)
        
        # Remove from colspan (6 -> 5 if we removed a column)
        content = re.sub(r'colSpan=\{6\}', 'colSpan={5}', content)
        
        # Remove getDistrictsForRegion import if no longer used
        if 'getDistrictsForRegion' in content and 'getDistrictsForRegion(' not in content:
            content = re.sub(r',\s*getDistrictsForRegion', '', content)
            content = re.sub(r'getDistrictsForRegion,\s*', '', content)
        
        # Clean up empty imports
        content = re.sub(r'import\s*{\s*,', 'import {', content)
        content = re.sub(r',\s*,', ',', content)
        content = re.sub(r',\s*}', ' }', content)
        
        if content != original_content:
            # Backup original
            backup_path = str(filepath) + '.backup'
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(original_content)
            print(f"  ✓ Backup created: {backup_path}")
            
            # Write modified content
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  ✓ File updated successfully")
            return True
        else:
            print(f"  - No changes needed")
            return False
            
    except Exception as e:
        print(f"  ✗ Error: {str(e)}")
        return False

def main():
    """Main function to process all TypeScript files in frontend."""
    frontend_dir = Path(__file__).parent / 'frontend' / 'src'
    
    if not frontend_dir.exists():
        print(f"Error: Frontend directory not found: {frontend_dir}")
        return
    
    print(f"Scanning frontend directory: {frontend_dir}")
    print("=" * 60)
    
    # Find all TypeScript/React files
    files_to_process = []
    for ext in ['*.tsx', '*.ts']:
        files_to_process.extend(frontend_dir.rglob(ext))
    
    modified_count = 0
    for filepath in files_to_process:
        # Skip node_modules and build directories
        if 'node_modules' in str(filepath) or 'build' in str(filepath):
            continue
        
        if process_file(filepath):
            modified_count += 1
    
    print("\n" + "=" * 60)
    print(f"✓ Processing complete!")
    print(f"  Modified files: {modified_count}")
    print(f"  Total files scanned: {len(files_to_process)}")
    print("\nNote: Backup files (.backup) have been created for all modified files.")
    print("After testing, you can remove them with: find frontend/src -name '*.backup' -delete")

if __name__ == '__main__':
    main()
