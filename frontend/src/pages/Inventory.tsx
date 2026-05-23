import { useEffect, useState, useMemo } from 'react';
import { Package, RefreshCw, Plus, Trash2, Edit, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useInventory } from '../hooks/useInventory';
import { inventoryService } from '../services/inventoryService';
import api from '../services/api';

const PAGE_SIZE = 20;

export default function Inventory() {
  const { setPageTitle } = useUIStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // New item form
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newStock, setNewStock] = useState(0);

  const { data: inventory, isLoading, refetch } = useInventory({ limit: 2000 });

  useEffect(() => {
    setPageTitle('Quản lý Tồn kho');
  }, [setPageTitle]);

  // Filter + paginate
  const filtered = useMemo(() => {
    if (!inventory) return [];
    if (!search) return inventory;
    return inventory.filter((item: any) => {
      const name = item.supply?.name || item.name || '';
      return name.toLowerCase().includes(search.toLowerCase());
    });
  }, [inventory, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Add new item
  const handleAdd = async () => {
    if (!newName) return;
    try {
      await api.post('/forecast-v2/import-to-inventory', {
        items: [{ drug_name: newName, quantity: newStock, unit: newUnit }]
      });
      setShowAddModal(false);
      setNewName(''); setNewUnit(''); setNewStock(0);
      refetch();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể thêm'));
    }
  };

  // Update item
  const handleUpdate = async () => {
    if (!editItem) return;
    try {
      await inventoryService.updateInventory(editItem.id, {
        quantity_on_hand: editItem.current_stock,
        safety_stock_level: editItem.safety_stock,
      } as any);
      setEditItem(null);
      refetch();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể cập nhật'));
    }
  };

  // Delete item
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/inventory/${id}`);
      setDeleteConfirm(null);
      refetch();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể xoá'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" /> Quản lý Tồn kho
          </h2>
          <p className="text-sm text-gray-500">{filtered.length} vật tư</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> Làm mới
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Thêm mới
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
        <input
          type="text" placeholder="Tìm kiếm vật tư..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Đang tải...</div>
        ) : paged.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Không có dữ liệu</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tên vật tư</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">ĐVT</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Tồn kho</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Mức an toàn</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item: any, idx: number) => {
                const name = item.supply?.name || item.name || '—';
                const unit = item.supply?.unit || item.unit || '—';
                const stock = item.current_stock ?? item.quantity_on_hand ?? 0;
                const safety = item.safety_stock ?? item.safety_stock_level ?? 0;
                const ratio = safety > 0 ? stock / safety : (stock > 0 ? 2 : 0);
                const status = ratio < 0.3 ? 'Nguy hiểm' : ratio < 1 ? 'Cảnh báo' : 'An toàn';
                const statusColor = status === 'Nguy hiểm' ? 'bg-red-100 text-red-700' : status === 'Cảnh báo' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
                const rowNum = (page - 1) * PAGE_SIZE + idx + 1;

                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{rowNum}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{name}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{unit}</td>
                    <td className="px-4 py-3 text-right font-semibold">{stock.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{safety.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>{status}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditItem({ ...item, current_stock: stock, safety_stock: safety })}
                          className="p-1 hover:bg-blue-50 rounded" title="Sửa">
                          <Edit className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => setDeleteConfirm(item.id)}
                          className="p-1 hover:bg-red-50 rounded" title="Xoá">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Trang {page}/{totalPages} ({filtered.length} vật tư)
          </p>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page + i - 2;
              if (p < 1 || p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-3 py-1 border rounded text-sm ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-lg font-semibold">Thêm vật tư mới</h3>
            <div>
              <label className="text-sm text-gray-600">Tên vật tư *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="VD: Kim tiêm vô trùng" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600">Đơn vị</label>
                <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Cái, Viên, Chai..." />
              </div>
              <div>
                <label className="text-sm text-gray-600">Số lượng tồn kho</label>
                <input type="number" value={newStock} onChange={(e) => setNewStock(Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded-lg text-sm">Huỷ</button>
              <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Thêm</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-lg font-semibold">Cập nhật tồn kho</h3>
            <p className="text-sm text-gray-600">{editItem.supply?.name || editItem.name || '—'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600">Tồn kho hiện tại</label>
                <input type="number" value={editItem.current_stock}
                  onChange={(e) => setEditItem({ ...editItem, current_stock: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-600">Mức an toàn</label>
                <input type="number" value={editItem.safety_stock}
                  onChange={(e) => setEditItem({ ...editItem, safety_stock: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditItem(null)} className="px-4 py-2 border rounded-lg text-sm">Huỷ</button>
              <button onClick={handleUpdate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-80 space-y-4">
            <h3 className="text-lg font-semibold text-red-700">Xác nhận xoá</h3>
            <p className="text-sm text-gray-600">Bạn có chắc muốn xoá vật tư này khỏi kho?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border rounded-lg text-sm">Huỷ</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Xoá</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
