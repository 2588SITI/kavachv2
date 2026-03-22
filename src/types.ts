/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RFData {
  'Loco Id': string | number;
  'Station Id': string | number;
  'Percentage': number;
  [key: string]: any;
}

export interface TRNData {
  'NMS Health': string | number;
  [key: string]: any;
}

export interface RadioData {
  'Packet Type': string;
  'Time': string;
  [key: string]: any;
}

export interface DashboardStats {
  locoId: string | number;
  stnPerf: { stationId: string | number; percentage: number }[];
  badStns: (string | number)[];
  goodStns: (string | number)[];
  locoPerformance: number;
  arCount: number;
  maCount: number;
  nmsFailRate: number;
  avgLag: number;
  maPackets: { time: string; delay: number; category: string }[];
  nmsStatus: { name: string; value: number }[];
  intervalDist: { category: string; percentage: number }[];
  diagnosticAdvice: { title: string; detail: string; action: string; severity: 'high' | 'medium' | 'low' }[];
}

export const bucketDelay = (d: number) => {
  if (d <= 1.0) return "<= 1s (Normal)";
  if (d <= 2.0) return "1s - 2s (Delayed)";
  return "> 2s (Timeout)";
};
