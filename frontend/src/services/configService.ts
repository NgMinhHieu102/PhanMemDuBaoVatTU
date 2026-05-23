import api from './api';
import type {
  SystemConfig,
  ConversionRatio,
  ShortageThreshold,
  ConfigUpdateRequest,
  ConversionRatiosUpdateRequest,
  ThresholdsUpdateRequest,
  AuditLog,
} from '../types/config';

export const configService = {
  /**
   * Get all system configurations
   */
  async getConfigs(): Promise<SystemConfig[]> {
    const response = await api.get<SystemConfig[]>('/config');
    return response.data;
  },

  /**
   * Get a single configuration by key
   */
  async getConfigByKey(key: string): Promise<SystemConfig> {
    const response = await api.get<SystemConfig>(`/config/${key}`);
    return response.data;
  },

  /**
   * Update a configuration value by key (Admin only)
   */
  async updateConfig(key: string, data: ConfigUpdateRequest): Promise<SystemConfig> {
    const response = await api.put<SystemConfig>(`/config/${key}`, data);
    return response.data;
  },

  /**
   * Get all conversion ratios
   */
  async getConversionRatios(): Promise<ConversionRatio[]> {
    const response = await api.get<ConversionRatio[]>('/config/conversion-ratios');
    return response.data;
  },

  /**
   * Update conversion ratios (Admin only)
   */
  async updateConversionRatios(data: ConversionRatiosUpdateRequest): Promise<ConversionRatio[]> {
    const response = await api.put<ConversionRatio[]>('/config/conversion-ratios', data);
    return response.data;
  },

  /**
   * Get shortage thresholds
   */
  async getThresholds(): Promise<ShortageThreshold[]> {
    const response = await api.get<ShortageThreshold[]>('/config/thresholds');
    return response.data;
  },

  /**
   * Update shortage thresholds (Admin only)
   */
  async updateThresholds(data: ThresholdsUpdateRequest): Promise<ShortageThreshold[]> {
    const response = await api.put<ShortageThreshold[]>('/config/thresholds', data);
    return response.data;
  },

  /**
   * Get audit logs for config change history (Admin only)
   */
  async getAuditLogs(params?: {
    skip?: number;
    limit?: number;
    table_name?: string;
    action?: string;
    user_id?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<AuditLog[]> {
    const response = await api.get<AuditLog[]>('/audit-logs', { params });
    return response.data;
  },
};
