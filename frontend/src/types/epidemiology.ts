export type DiseaseType =
  | 'dengue_fever'
  | 'seasonal_flu'
  | 'respiratory_disease'
  | 'viral_infection';

export interface DiseaseCase {
  id: number;
  recorded_at: string;
  disease_type: DiseaseType;
  case_count: number;
  location: string;
  severity?: string;
  data_source?: string;
  created_at: string;
}

export interface DiseaseCaseCreate {
  recorded_at: string;
  disease_type: DiseaseType;
  case_count: number;
  location: string;
  severity?: string;
  data_source?: string;
}

export interface DiseaseStatistic {
  disease_type: DiseaseType;
  total_cases: number;
  record_count: number;
  latest_record_date: string;
  avg_cases_per_day?: number;
}

export interface DiseaseTrendPoint {
  date: string;
  case_count: number;
  disease_type: DiseaseType;
}

export interface DiseaseStatsResponse {
  statistics: DiseaseStatistic[];
  filters: {
    location?: string;
    start_date?: string;
    end_date?: string;
  };
}

export interface DiseaseTrendsResponse {
  trends: DiseaseTrendPoint[];
  filters: {
    disease_type?: DiseaseType;
    location?: string;
    start_date?: string;
    end_date?: string;
  };
}

export const DISEASE_TYPE_LABELS: Record<DiseaseType, string> = {
  dengue_fever: 'Sốt xuất huyết',
  seasonal_flu: 'Cúm mùa',
  respiratory_disease: 'Bệnh hô hấp',
  viral_infection: 'Nhiễm virus',
};

export const DISEASE_TYPE_COLORS: Record<DiseaseType, string> = {
  dengue_fever: '#ef4444', // red
  seasonal_flu: '#3b82f6', // blue
  respiratory_disease: '#f59e0b', // amber
  viral_infection: '#8b5cf6', // violet
};
