/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  BarChart3, 
  Activity, 
  Database,
  Info,
  Clock,
  Settings,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Zap,
  MapPin,
  Download,
  FileText,
  RefreshCw
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  LabelList,
  ReferenceLine
} from 'recharts';
import { parseFile, processDashboardData, parseDateString, formatStationName } from './utils/dataProcessor';
import { DashboardStats } from './types';
import { cn } from './utils/cn';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function App() {
  const [files, setFiles] = useState<{ rf: File[]; rfSt: File[]; trn: File[]; radio: File | null }>({
    rf: [],
    rfSt: [],
    trn: [],
    radio: null,
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [tagSearch, setTagSearch] = useState('');
  const [selectedStation, setSelectedStation] = useState<string>('All');
  const [selectedLoco, setSelectedLoco] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('All');
  const [endDate, setEndDate] = useState<string>('All');
  
  // Cloud Storage State
  const [isAwsConnected, setIsAwsConnected] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [availableLocos, setAvailableLocos] = useState<string[]>([]);
  const [cloudLoco, setCloudLoco] = useState<string>('All');

  useEffect(() => {
    checkAwsStatus();
  }, []);

  const checkAwsStatus = async () => {
    try {
      const res = await fetch('/api/aws/files');
      if (!res.ok) {
        const text = await res.text();
        console.error("AWS se error aaya hai (Status Check):", text);
        return;
      }
      const data = await res.json();
      if (!data.error) {
        setIsAwsConnected(true);
        setCloudFiles(data.files);
        updateAvailableDatesAndLocos(data.files);
      }
    } catch (err) {
      console.error('Error checking AWS status:', err);
    }
  };

  const handleAwsConnect = async () => {
    setIsFetching(true);
    try {
      const res = await fetch('/api/aws/files');
      if (!res.ok) {
        const text = await res.text();
        console.error("AWS se error aaya hai (Connect):", text);
        alert(`Server Error: ${res.status}\n\nDetails: ${text.substring(0, 100)}...`);
        return;
      }
      const data = await res.json();
      if (data.error) {
        const details = data.details ? `\nDetails: ${data.details}` : '';
        alert(`AWS Connection Error: ${data.error}${details}\n\nPlease ensure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BUCKET_NAME are set in Environment Variables.`);
        return;
      }
      setIsAwsConnected(true);
      console.log('AWS S3 Files:', data.files);
      setCloudFiles(data.files);
      updateAvailableDatesAndLocos(data.files);
      alert(`Successfully connected to AWS S3! Found ${data.files.length} files.`);
    } catch (err: any) {
      console.error('Error connecting to AWS:', err);
      alert(`Failed to connect to AWS S3. ${err.message || ''}`);
    } finally {
      setIsFetching(false);
    }
  };

  const extractDateFromFilename = (filename: string): string | null => {
    const nameOnly = filename.split('/').pop() || filename;
    
    const findDate = (str: string): string | null => {
      // Standard formats: DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, DD_MM_YYYY
      const match = str.match(/\d{1,2}[-/._]\d{1,2}[-/._]\d{2,4}/);
      if (match) {
        const parts = match[0].split(/[-/._]/);
        if (parts.length === 3) {
          let day, month, year;
          if (parts[0].length === 4) {
            year = parts[0];
            month = parts[1].padStart(2, '0');
            day = parts[2].padStart(2, '0');
          } else {
            day = parts[0].padStart(2, '0');
            month = parts[1].padStart(2, '0');
            year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          }
          const result = `${day}-${month}-${year}`;
          return result;
        }
      }
      
      const match8 = str.match(/\d{8}/);
      if (match8) {
        const val = match8[0];
        const year = parseInt(val.substring(0, 4));
        let result;
        if (year > 1900 && year < 2100) {
          result = `${val.substring(6, 8)}-${val.substring(4, 6)}-${val.substring(0, 4)}`;
        } else {
          result = `${val.substring(0, 2)}-${val.substring(2, 4)}-${val.substring(4, 8)}`;
        }
        return result;
      }
      return null;
    };

    const date = findDate(nameOnly) || findDate(filename);
    if (date) {
      console.log(`Extracted date ${date} from path: ${filename}`);
    } else {
      console.log(`Failed to extract date from path: ${filename}`);
    }
    return date;
  };

  const extractLocoFromFilename = (filename: string): string | null => {
    const nameOnly = filename.split('/').pop() || filename;
    const idMatch = nameOnly.match(/(?:\d{8}_)?([A-Z0-9_\-]{2,15})_(?:RFCOMM|ST|STN|TRNMSNMA|RADIO)/i) || 
                    nameOnly.match(/(?:\d{8}_)?([A-Z0-9_\-]{2,15})/i);
    if (idMatch) {
      let extractedId = idMatch[1];
      const upperId = extractedId.toUpperCase();
      if (['RFCOMM', 'STATION', 'TRAIN', 'STN', 'LOCO', 'REPORT', 'LOG', 'TRNMSNMA', 'RADIO', 'ALL'].includes(upperId)) {
        return null;
      }
      return extractedId;
    }
    return null;
  };

  const updateAvailableDatesAndLocos = (newFiles: any[]) => {
    const dates = new Set<string>(availableDates);
    const locos = new Set<string>(availableLocos);
    newFiles.forEach((f: any) => {
      const date = extractDateFromFilename(f.name);
      if (date) dates.add(date);
      const loco = extractLocoFromFilename(f.name);
      if (loco) locos.add(loco);
    });
    const sortedDates = Array.from(dates).sort((a, b) => parseDateString(a) - parseDateString(b));
    const sortedLocos = Array.from(locos).sort();
    console.log('Found Available Dates:', sortedDates);
    console.log('Found Available Locos:', sortedLocos);
    setAvailableDates(sortedDates);
    setAvailableLocos(sortedLocos);
  };

  const analyzeCloudData = async () => {
    if (startDate === 'All' || endDate === 'All') {
      alert('Please select both Start and End dates.');
      return;
    }

    setIsFetching(true);
    try {
      const startT = parseDateString(startDate);
      const endT = parseDateString(endDate);

      // Filter files by date and type
      console.log(`Filtering ${cloudFiles.length} cloud files for range ${startDate} to ${endDate}...`);
      console.log(`Start Timestamp: ${startT}, End Timestamp: ${endT}`);
      
      const selectedFiles = cloudFiles.filter(f => {
        const dateStr = extractDateFromFilename(f.name);
        if (!dateStr) {
          console.log(` - Skipping ${f.name}: No date found`);
          return false;
        }
        const fileT = parseDateString(dateStr);
        const isDateMatch = fileT >= startT && fileT <= endT;
        
        let isLocoMatch = true;
        if (cloudLoco !== 'All') {
          const locoStr = extractLocoFromFilename(f.name);
          // If it's a station file, we might still need it, but let's filter TRN and RADIO files by loco
          if (f.name.toUpperCase().includes('TRNMSNMA') || f.name.toUpperCase().includes('RADIO') || f.name.toUpperCase().includes('RFCOMM_TR')) {
             isLocoMatch = locoStr === cloudLoco;
          }
        }

        const isMatch = isDateMatch && isLocoMatch;
        console.log(` - File: ${f.name}, Extracted: ${dateStr}, Timestamp: ${fileT}, In Range: ${isDateMatch}, Loco Match: ${isLocoMatch}`);
        return isMatch;
      });

      if (selectedFiles.length === 0) {
        alert('No files found for the selected date range.');
        return;
      }

      const rfTrFiles = selectedFiles.filter(f => {
        const name = f.name.toUpperCase();
        const nameOnly = f.name.split('/').pop()?.toUpperCase() || '';
        
        // Priority 1: Explicit markers
        if (nameOnly.includes('RFCOMM_TR')) return true;
        if (nameOnly.includes('RFCOMM_ST')) return false;
        
        // Priority 2: ID patterns in filename
        if (/\d{5}_RFCOMM/i.test(nameOnly) || /RFCOMM_\d{5}/i.test(nameOnly)) return true;
        if (/[A-Z0-9_]{2,12}_RFCOMM/i.test(nameOnly) || /RFCOMM_[A-Z0-9_]{2,12}/i.test(nameOnly)) return false;

        // Priority 3: Folder markers
        if (name.includes('RFCOMM_TR')) return true;
        if (name.includes('RFCOMM_ST')) return false;
        
        // Priority 4: Filename content (LOCO or 5-digit ID)
        // We check nameOnly to avoid folder names triggering this for the wrong files
        if (nameOnly.includes('LOCO') || /\b\d{5}\b/.test(nameOnly)) return true;
        
        // Fallback
        return name.includes('LOCO') && !nameOnly.includes('STN') && !nameOnly.includes('STATION');
      });

      const rfStFiles = selectedFiles.filter(f => {
        const name = f.name.toUpperCase();
        const nameOnly = f.name.split('/').pop()?.toUpperCase() || '';
        
        // Priority 1: Explicit markers
        if (nameOnly.includes('RFCOMM_ST')) return true;
        if (nameOnly.includes('RFCOMM_TR')) return false;
        
        // Priority 2: ID patterns
        const isStnPattern = /[A-Z0-9_]{2,12}_RFCOMM/i.test(nameOnly) || /RFCOMM_[A-Z0-9_]{2,12}/i.test(nameOnly);
        const isLocoPattern = /\d{5}_RFCOMM/i.test(nameOnly) || /RFCOMM_\d{5}/i.test(nameOnly);
        if (isStnPattern && !isLocoPattern) return true;

        // Priority 3: Folder markers
        if (name.includes('RFCOMM_ST')) return true;
        if (name.includes('RFCOMM_TR')) return false;
        
        // Priority 4: Filename content
        if (nameOnly.includes('STN') || nameOnly.includes('STATION')) return true;
        
        return name.includes('STN') || name.includes('STATION') || name.includes('_ST_');
      });
      const trnFiles = selectedFiles.filter(f => f.name.toUpperCase().includes('TRN'));
      const radioFiles = selectedFiles.filter(f => f.name.toUpperCase().includes('RADIO'));

      console.log('File Categorization:');
      console.log(` - RF Train Files: ${rfTrFiles.length}`, rfTrFiles.map(f => f.name));
      console.log(` - RF Station Files: ${rfStFiles.length}`, rfStFiles.map(f => f.name));
      console.log(` - TRN Files: ${trnFiles.length}`, trnFiles.map(f => f.name));
      console.log(` - Radio Files: ${radioFiles.length}`, radioFiles.map(f => f.name));

      if (rfTrFiles.length === 0 && rfStFiles.length === 0) {
        alert('No RF files found for the selected date range. RF logs (Train or Station) are required for analysis.');
        return;
      }

      const fetchAndParse = async (f: any) => {
        try {
          console.log(`Fetching file: ${f.name} (ID: ${f.id})`);
          const resUrl = await fetch(`/api/aws/download/${encodeURIComponent(f.id)}`);
          if (!resUrl.ok) {
            const text = await resUrl.text();
            console.error("AWS se error aaya hai (Download URL):", text);
            throw new Error(`Server Error: ${resUrl.status}`);
          }
          const data = await resUrl.json();
          if (data.error) throw new Error(data.error);
          
          const res = await fetch(data.url);
          if (!res.ok) {
            const text = await res.text();
            console.error("AWS se error aaya hai (File Download):", text);
            throw new Error(`Failed to download file from S3: ${res.statusText}`);
          }
          
          const blob = await res.blob();
          console.log(`Parsing file: ${f.name}, size: ${blob.size} bytes`);
          return await parseFile(blob, f.name);
        } catch (err: any) {
          console.error(`Error processing file ${f.name}:`, err);
          throw new Error(`Failed to process ${f.name}: ${err.message}`);
        }
      };

      const rfTrData = (await Promise.all(rfTrFiles.map(fetchAndParse))).flat();
      const rfStData = (await Promise.all(rfStFiles.map(fetchAndParse))).flat();
      
      console.log(`Parsed Data: Train Rows=${rfTrData.length}, Station Rows=${rfStData.length}`);
      const trnData = trnFiles.length > 0 ? (await Promise.all(trnFiles.map(fetchAndParse))).flat() : null;
      const radioData = radioFiles.length > 0 ? (await Promise.all(radioFiles.map(fetchAndParse))).flat() : [];

      const processed = processDashboardData(rfTrData, trnData, radioData, rfStData);
      setStats(processed);
      setSelectedStation('All');
      setSelectedLoco('All');
    } catch (err: any) {
      console.error('Error analyzing cloud data:', err);
      alert(`Failed to analyze data from AWS S3: ${err.message || 'Unknown error'}`);
    } finally {
      setIsFetching(false);
    }
  };

  const handleAwsLogout = () => {
    setIsAwsConnected(false);
    setCloudFiles([]);
    setAvailableDates([]);
    setStats(null);
  };

  const handleFileUpload = (type: keyof typeof files, uploaded: File | FileList) => {
    if (type === 'radio') {
      const file = uploaded instanceof FileList ? uploaded[0] : uploaded;
      setFiles((prev) => ({ ...prev, radio: file }));
    } else {
      const newFiles = uploaded instanceof FileList ? Array.from(uploaded) : [uploaded];
      setFiles((prev) => ({ ...prev, [type]: [...prev[type as 'rf' | 'rfSt' | 'trn'], ...newFiles] }));
    }
  };

  const analyzeData = async () => {
    if (files.rf.length === 0 && files.rfSt.length === 0 && files.trn.length === 0) return;
    
    setIsFetching(true);
    try {
      const rfTrData = (await Promise.all(files.rf.map(f => parseFile(f)))).flat();
      const rfStData = (await Promise.all(files.rfSt.map(f => parseFile(f)))).flat();
      const trnData = files.trn.length > 0 ? (await Promise.all(files.trn.map(f => parseFile(f)))).flat() : null;
      const radioData = files.radio ? await parseFile(files.radio) : [];
      
      const processed = processDashboardData(rfTrData, trnData, radioData, rfStData);
      setStats(processed);
      setSelectedStation('All');
      setSelectedLoco('All');
      setStartDate('All');
      setEndDate('All');
    } catch (err: any) {
      console.error('Error analyzing local data:', err);
      alert(`Failed to analyze local data: ${err.message || 'Unknown error'}`);
    } finally {
      setIsFetching(false);
    }
  };

  const getFilteredStats = (): DashboardStats | null => {
    if (!stats) return null;
    
    let filtered = { ...stats };

    // Date Range Filtering
    if (startDate !== 'All' || endDate !== 'All') {
      const startT = startDate !== 'All' ? parseDateString(startDate) : 0;
      const endT = endDate !== 'All' ? parseDateString(endDate) : Infinity;

      const filterByDate = (item: any) => {
        if (!item.date) return true;
        const itemT = parseDateString(item.date);
        return itemT >= startT && itemT <= endT;
      };

      filtered.stationStats = filtered.stationStats.filter(filterByDate);
      filtered.stnPerf = filtered.stnPerf.filter(filterByDate);
      filtered.tagLinkIssues = filtered.tagLinkIssues.filter(filterByDate);
      filtered.uniqueTrainLengths = filtered.uniqueTrainLengths.filter(filterByDate);
      filtered.trainConfigChanges = filtered.trainConfigChanges.filter(filterByDate);
      filtered.modeDegradations = filtered.modeDegradations.filter(filterByDate);
      filtered.brakeApplications = filtered.brakeApplications.filter(filterByDate);
      filtered.signalOverrides = filtered.signalOverrides.filter(filterByDate);
      filtered.sosEvents = filtered.sosEvents.filter(filterByDate);
      filtered.maPackets = filtered.maPackets.filter(filterByDate);
      filtered.shortPackets = filtered.shortPackets.filter(filterByDate);
      filtered.nmsLogs = filtered.nmsLogs.filter(filterByDate);
      filtered.rawRfLogs = filtered.rawRfLogs.filter(filterByDate);

      // Update display duration
      if (startDate !== 'All') filtered.startTime = startDate;
      if (endDate !== 'All') filtered.endTime = endDate;
    }

    if (selectedLoco !== 'All') {
      filtered.stationStats = filtered.stationStats.filter(s => 
        String(s.locoId) === selectedLoco || 
        (s.source === 'station' && String(s.locoId) === 'Station Log')
      );
      filtered.stnPerf = filtered.stnPerf.filter(s => String(s.locoId) === selectedLoco);
      filtered.tagLinkIssues = filtered.tagLinkIssues.filter(t => String(t.locoId) === selectedLoco);
      filtered.uniqueTrainLengths = filtered.uniqueTrainLengths.filter(t => String(t.locoId) === selectedLoco);
      filtered.trainConfigChanges = filtered.trainConfigChanges.filter(t => String(t.locoId) === selectedLoco);
      filtered.modeDegradations = filtered.modeDegradations.filter(m => String(m.locoId) === selectedLoco);
      filtered.brakeApplications = filtered.brakeApplications.filter(b => String(b.locoId) === selectedLoco);
      filtered.signalOverrides = filtered.signalOverrides.filter(s => String(s.locoId) === selectedLoco);
      filtered.sosEvents = filtered.sosEvents.filter(s => String(s.locoId) === selectedLoco);
      filtered.maPackets = filtered.maPackets.filter(p => String(p.locoId) === selectedLoco);
      filtered.shortPackets = filtered.shortPackets.filter(p => String(p.locoId) === selectedLoco);
      filtered.nmsLogs = filtered.nmsLogs.filter(n => String(n.locoId) === selectedLoco);
      
      // Update primary locoId for display
      filtered.locoId = selectedLoco;

      // Recalculate Radio Lag
      if (filtered.maPackets.length > 0) {
        filtered.avgLag = filtered.maPackets.reduce((acc, p) => acc + p.delay, 0) / filtered.maPackets.length;
      } else {
        filtered.avgLag = 0;
      }

      // Recalculate NMS Status and Fail Rate
      if (filtered.nmsLogs.length > 0) {
        const nmsMap: Record<string, number> = {};
        filtered.nmsLogs.forEach(n => {
          nmsMap[n.health] = (nmsMap[n.health] || 0) + 1;
        });
        filtered.nmsStatus = Object.entries(nmsMap).map(([name, value]) => ({ name, value }));
        filtered.nmsFailRate = (filtered.nmsLogs.filter(n => n.health !== '0').length / filtered.nmsLogs.length) * 100;
      } else {
        filtered.nmsStatus = [];
        filtered.nmsFailRate = 0;
      }
    } else {
      filtered.locoId = 'All Locos';
    }

    if (selectedStation !== 'All') {
      filtered.stationStats = filtered.stationStats.filter(s => String(s.stationId) === selectedStation);
      filtered.stnPerf = filtered.stnPerf.filter(s => String(s.stationId) === selectedStation);
      filtered.tagLinkIssues = filtered.tagLinkIssues.filter(t => String(t.stationId) === selectedStation);
      filtered.uniqueTrainLengths = filtered.uniqueTrainLengths.filter(t => String(t.stationId) === selectedStation);
      filtered.trainConfigChanges = filtered.trainConfigChanges.filter(t => String(t.stationId) === selectedStation);
      filtered.modeDegradations = filtered.modeDegradations.filter(m => String(m.stationId) === selectedStation);
      filtered.brakeApplications = filtered.brakeApplications.filter(b => String(b.stationId) === selectedStation);
      filtered.signalOverrides = filtered.signalOverrides.filter(s => String(s.stationId) === selectedStation);
      filtered.sosEvents = filtered.sosEvents.filter(s => String(s.stationId) === selectedStation);
    }

    // Recalculate loco performance and station lists after all filters
    if (filtered.stationStats.length > 0) {
      // Aggregate by station, direction, and source for the final view
      const aggregated: Record<string, any> = {};
      filtered.stationStats.forEach(s => {
        const key = `${s.stationId}|${s.direction}|${s.source}`;
        if (!aggregated[key]) {
          aggregated[key] = { ...s, totalRowCount: s.rowCount, totalPercSum: s.totalPercSum, totalExp: s.expected, totalRec: s.received };
        } else {
          aggregated[key].totalRowCount += s.rowCount;
          aggregated[key].totalPercSum += s.totalPercSum;
          aggregated[key].totalExp += s.expected;
          aggregated[key].totalRec += s.received;
        }
      });

      filtered.stationStats = Object.values(aggregated).map(s => ({
        ...s,
        percentage: s.totalPercSum / s.totalRowCount,
        expected: s.totalExp,
        received: s.totalRec,
        rowCount: s.totalRowCount,
        totalPercSum: s.totalPercSum
      }));

      const totalExpAll = filtered.stationStats.reduce((acc, s) => acc + s.expected, 0);
      const totalRecAll = filtered.stationStats.reduce((acc, s) => acc + s.received, 0);
      
      const totalOverallPercSum = filtered.stationStats.reduce((acc, s) => acc + s.totalPercSum, 0);
      const totalOverallRowCount = filtered.stationStats.reduce((acc, s) => acc + s.totalRowCount, 0);
      
      filtered.locoPerformance = totalOverallRowCount > 0 
        ? totalOverallPercSum / totalOverallRowCount 
        : 0;
      
      filtered.badStns = Array.from(new Set(filtered.stationStats.filter(s => s.percentage < 95).map(s => String(s.stationId))));
      filtered.goodStns = Array.from(new Set(filtered.stationStats.filter(s => s.percentage >= 95).map(s => String(s.stationId))));
    }

    // Update Deep Analysis for the selected loco
    if (stats.locoAnalyses) {
      const analysisKey = selectedLoco === 'All' ? 'All' : selectedLoco;
      if (stats.locoAnalyses[analysisKey]) {
        filtered.stationDeepAnalysis = stats.locoAnalyses[analysisKey];
      }
    }

    return filtered;
  };

  const filteredStats = getFilteredStats();
  const uniqueStations: string[] = stats 
    ? ['All', ...Array.from(new Set(stats.stationStats
        .filter(s => selectedLoco === 'All' || String(s.locoId) === selectedLoco)
        .map(s => String(s.stationId)))) as string[]] 
    : ['All'];
  const uniqueLocos = stats ? ['All', ...new Set(stats.locoIds.map(id => String(id)))] : ['All'];

  const generatePDFReport = () => {
    try {
      if (!filteredStats) {
        console.error("No stats available for report");
        return;
      }
      
      const doc = new jsPDF();
      const date = new Date().toLocaleString();

      // Header
      doc.setFontSize(22);
      doc.setTextColor(0, 102, 204);
      doc.text('KAVACH EXPERT DIAGNOSTIC REPORT', 105, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Generated on: ${date}`, 105, 28, { align: 'center' });
      doc.line(20, 32, 190, 32);

      // Loco Info
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text(`Loco ID: ${filteredStats.locoId}`, 20, 45);
      doc.text(`Mentored by: CELE Sir`, 20, 52);
      if (selectedStation !== 'All') {
        doc.text(`Filtered Station: ${formatStationName(selectedStation)}`, 20, 59);
      }

      // Executive Summary
      doc.setFontSize(16);
      doc.setTextColor(0, 102, 204);
      doc.text('1. Executive Summary', 20, 75);
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text(`Overall Loco Performance: ${filteredStats.locoPerformance.toFixed(2)}%`, 25, 85);
      doc.text(`NMS Failure Rate: ${filteredStats.nmsFailRate.toFixed(2)}%`, 25, 92);
      doc.text(`Average MA Refresh Lag: ${filteredStats.avgLag.toFixed(2)}s`, 25, 99);

      let currentY = 110;

      // Tag Issues Table
      if (filteredStats.tagLinkIssues.length > 0) {
        doc.setFontSize(16);
        doc.setTextColor(0, 102, 204);
        doc.text('2. Critical Tag Link Issues', 20, currentY);
        
        const tagRows = filteredStats.tagLinkIssues.map(t => [t.time, formatStationName(t.stationId), t.error, t.info]);
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Time', 'Station ID', 'Error Type', 'Details']],
          body: tagRows,
          theme: 'striped',
          headStyles: { fillColor: [0, 102, 204] },
          styles: { fontSize: 8 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Diagnostic Advice
      if (currentY > 240) { doc.addPage(); currentY = 20; }
      
      doc.setFontSize(16);
      doc.setTextColor(0, 102, 204);
      doc.text('3. Diagnostic Advice & Recommendations', 20, currentY);
      
      let adviceY = currentY + 10;
      filteredStats.diagnosticAdvice.forEach((advice, index) => {
        if (adviceY > 270) { doc.addPage(); adviceY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(`${index + 1}. ${advice.title} (${advice.severity.toUpperCase()})`, 25, adviceY);
        doc.setFontSize(9);
        doc.setTextColor(80);
        const actionLines = doc.splitTextToSize(`Action: ${advice.action}`, 160);
        doc.text(actionLines, 30, adviceY + 5);
        adviceY += 10 + (actionLines.length * 4);
      });

      // 4. Deep Analysis Section (New Page)
      doc.addPage();
      currentY = 20;
      doc.setFontSize(18);
      doc.setTextColor(0, 102, 204);
      doc.text('4. Deep Analysis — Packet Loss Root Cause', 20, currentY);
      
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text(`Conclusion: ${filteredStats.stationDeepAnalysis.dashboard.conclusion}`, 20, currentY + 10);
      doc.setFont('helvetica', 'normal');
      
      currentY += 20;

      // Verdict Boxes (Visual)
      const isLFaulty = filteredStats.stationDeepAnalysis.dashboard.conclusion.includes('Loco');
      const isSFaulty = filteredStats.stationDeepAnalysis.dashboard.conclusion.includes('Station');
      
      doc.setFillColor(isLFaulty ? 255 : 240, isLFaulty ? 230 : 240, isLFaulty ? 230 : 240);
      doc.rect(20, currentY, 55, 30, 'F');
      doc.setTextColor(isLFaulty ? 200 : 100, 0, 0);
      doc.setFontSize(10);
      doc.text('LOCO TCAS', 47.5, currentY + 10, { align: 'center' });
      doc.setFontSize(14);
      doc.text(isLFaulty ? 'SUSPECT' : 'FIT', 47.5, currentY + 22, { align: 'center' });

      doc.setFillColor(isSFaulty ? 255 : 240, isSFaulty ? 245 : 240, isSFaulty ? 230 : 240);
      doc.rect(77.5, currentY, 55, 30, 'F');
      doc.setTextColor(isSFaulty ? 180 : 100, isSFaulty ? 120 : 100, 0);
      doc.setFontSize(10);
      doc.text('STATION TCAS', 105, currentY + 10, { align: 'center' });
      doc.setFontSize(14);
      doc.text(isSFaulty ? 'INSPECT' : 'HEALTHY', 105, currentY + 22, { align: 'center' });

      doc.setFillColor(230, 255, 230);
      doc.rect(135, currentY, 55, 30, 'F');
      doc.setTextColor(0, 150, 0);
      doc.setFontSize(10);
      doc.text('BENCHMARK', 162.5, currentY + 10, { align: 'center' });
      doc.setFontSize(14);
      doc.text('CLEARED', 162.5, currentY + 22, { align: 'center' });

      currentY += 40;

      // Loco Journey Table
      doc.setTextColor(0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Loco Journey Performance Map', 20, currentY);
      
      const journeyRows = filteredStats.stationDeepAnalysis.dashboard.problem1.table.map(r => [formatStationName(r.station), r.locoVal, r.othersAvg]);
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Station', `Loco ${filteredStats.locoId}`, 'Baaki Locos (Avg)']],
        body: journeyRows,
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50] },
        styles: { fontSize: 9 }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Multi-Loco Cross-Check
      if (filteredStats.multiLocoBadStns.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Multi-Loco Station Cross-Check', 20, currentY);
        
        const crossRows = filteredStats.multiLocoBadStns.map(s => [
          formatStationName(s.stationId), 
          s.locoCount, 
          `${s.avgPerf.toFixed(1)}%`,
          s.locoCount >= 3 ? 'PRIORITY INSPECTION' : 'ROUTINE CHECK'
        ]);
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Station', 'Locos Failed', 'Avg Perf', 'Action Required']],
          body: crossRows,
          theme: 'grid',
          headStyles: { fillColor: [180, 120, 0] },
          styles: { fontSize: 9 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Probability Bars
      if (currentY > 240) { doc.addPage(); currentY = 20; }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Root Cause Probability Analysis', 20, currentY);
      
      const rc = filteredStats.stationDeepAnalysis.rootCause;
      const drawBar = (label: string, val: number, y: number, color: [number, number, number]) => {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(label, 20, y);
        doc.setFillColor(240, 240, 240);
        doc.rect(60, y - 3, 100, 4, 'F');
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(60, y - 3, val, 4, 'F');
        doc.setTextColor(0);
        doc.text(`${val}%`, 165, y);
      };

      drawBar('Station-side', rc.stationSide, currentY + 10, [16, 185, 129]);
      drawBar('Loco-side', rc.locoSide, currentY + 18, [244, 63, 94]);
      drawBar('Hardware Prob.', rc.hardwareProb, currentY + 26, [245, 158, 11]);
      drawBar('Software Prob.', rc.softwareProb, currentY + 34, [59, 130, 246]);

      currentY += 45;

      // AML Benchmark Conclusion
      doc.setFontSize(10);
      doc.setTextColor(0, 150, 0);
      doc.setFont('helvetica', 'italic');
      const amlLines = doc.splitTextToSize(filteredStats.stationDeepAnalysis.dashboard.amlConclusion, 160);
      doc.text(amlLines, 20, currentY);
      currentY += (amlLines.length * 5) + 5;

      // Action Required Box
      doc.setFillColor(0, 102, 204);
      doc.rect(20, currentY, 170, 25, 'F');
      doc.setTextColor(255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('FINAL ACTION REQUIRED:', 25, currentY + 8);
      doc.setFontSize(11);
      const actionLines = doc.splitTextToSize(filteredStats.stationDeepAnalysis.dashboard.actionRequired, 160);
      doc.text(actionLines, 25, currentY + 15);

      // 5. Radio Loss Detailed Analysis
      const radioEvents = filteredStats.stationDeepAnalysis.criticalEvents.filter(e => e.type === 'Radio Loss');
      if (radioEvents.length > 0) {
        doc.addPage();
        currentY = 20;
        doc.setFontSize(18);
        doc.setTextColor(0, 102, 204);
        doc.text('5. Radio Loss Detailed Analysis', 20, currentY);
        
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text('Summary Metrics:', 25, currentY + 10);
        doc.setFont('helvetica', 'normal');
        
        const totalEvents = radioEvents.length;
        const avgDuration = Math.round(radioEvents.reduce((acc, e) => acc + e.duration, 0) / totalEvents);
        const maxDuration = Math.max(...radioEvents.map(e => e.duration));
        
        doc.text(`Total Radio Loss Events: ${totalEvents}`, 30, currentY + 17);
        doc.text(`Average Loss Duration: ${avgDuration}s`, 30, currentY + 24);
        doc.text(`Maximum Loss Duration: ${maxDuration}s`, 30, currentY + 31);
        
        // Simple Bar Chart for top 10 longest radio losses
        const topLosses = [...radioEvents].sort((a, b) => b.duration - a.duration).slice(0, 10);
        if (topLosses.length > 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Top 10 Longest Radio Loss Events (Visual):', 25, currentY + 40);
          
          let chartY = currentY + 50;
          const maxD = Math.max(...topLosses.map(e => e.duration));
          
          topLosses.forEach((e, i) => {
            const barWidth = (e.duration / maxD) * 80;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(`${e.time} (${formatStationName(e.stationId)})`, 25, chartY + 3);
            
            doc.setFillColor(244, 63, 94);
            doc.rect(75, chartY, barWidth, 4, 'F');
            doc.setTextColor(0);
            doc.text(`${e.duration}s`, 78 + barWidth, chartY + 3);
            chartY += 8;
          });
          currentY = chartY + 10;
        } else {
          currentY += 40;
        }
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Chronological Radio Loss Log', 20, currentY);
        
        const radioRows = [...radioEvents].sort((a, b) => a.time.localeCompare(b.time)).map(e => {
          const name = e.stationName && e.stationName !== 'N/A' && e.stationName !== '-' ? String(e.stationName) : '';
          const id = e.stationId && e.stationId !== 'N/A' && e.stationId !== '-' ? formatStationName(e.stationId) : '';
          let stn = 'Unknown Station';
          
          if (name && id) {
            stn = `${formatStationName(name)} (${id})`;
          } else if (name) {
            stn = formatStationName(name);
          } else if (id) {
            stn = formatStationName(id);
          }
          
          return [
            e.time,
            e.locoId,
            stn,
            `${e.duration}s`,
            e.radio || 'Radio 1',
            e.reason || 'N/A',
            e.description
          ];
        });
        
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Time', 'Loco ID', 'Station', 'Duration', 'Radio', 'Reason', 'Details']],
          body: radioRows,
          theme: 'grid',
          headStyles: { fillColor: [225, 29, 72] }, // Rose-600
          styles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 20 },
            2: { cellWidth: 25 },
            3: { cellWidth: 20 },
            4: { cellWidth: 20 },
            5: { cellWidth: 30 },
            6: { cellWidth: 'auto' }
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // 6. Moving Radio Loss Analysis (Speed > 0)
      if (filteredStats.movingRadioLoss && filteredStats.movingRadioLoss.length > 0) {
        doc.addPage();
        currentY = 20;
        doc.setFontSize(18);
        doc.setTextColor(0, 102, 204);
        doc.text('6. Moving Radio Loss Analysis (Speed > 0)', 20, currentY);
        
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text('This analysis filters out stationary periods (Speed = 0) to focus on operational signal quality.', 20, currentY + 8);
        
        const movingRows = filteredStats.movingRadioLoss.map(m => [
          m.locoId,
          m.movingGaps,
          `${m.maxGap}s`,
          `${m.r1Usage}%`,
          `${m.r2Usage}%`,
          m.conclusion
        ]);
        
        autoTable(doc, {
          startY: currentY + 15,
          head: [['Loco ID', 'Moving Gaps', 'Max Gap', 'R1 Usage', 'R2 Usage', 'Conclusion']],
          body: movingRows,
          theme: 'grid',
          headStyles: { fillColor: [16, 185, 129] }, // Emerald-600
          styles: { fontSize: 9 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Signature
      const pageCount = doc.getNumberOfPages();
      doc.setPage(pageCount);
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('__________________________', 140, 270);
      doc.text('Authorized Signature', 140, 277);
      doc.text('Kavach Technical Team', 140, 284);

      doc.save(`Kavach_Report_Loco_${filteredStats.locoId}${selectedStation !== 'All' ? '_Stn_' + formatStationName(selectedStation).replace(/\s+/g, '_') : ''}.pdf`);
    } catch (error) {
      console.error("PDF Generation Error:", error);
      alert("There was an issue generating the report. Please check the console.");
    }
  };

  const generateFailureLetter = () => {
    const filteredStats = getFilteredStats();
    if (!filteredStats) return;

    if (selectedLoco === 'All') {
      alert("Please select a specific Loco ID for the failure analysis letter.");
      return;
    }

    try {
      const doc = new jsPDF();
      const date = new Date().toLocaleDateString();
      const time = new Date().toLocaleTimeString();
      const reportId = `KAV/${filteredStats.locoId}/${Math.floor(Math.random() * 10000)}`;
      
      // Header
      doc.setFontSize(18);
      doc.setTextColor(0);
      doc.line(20, 30, 190, 30);

      // Meta Info
      doc.setFontSize(10);
      doc.text(`Date: ${date}`, 150, 38);
      doc.text(`Time: ${time}`, 150, 43);
      doc.text(`Report ID: ${reportId}`, 20, 38);
      doc.text(`Loco ID: ${filteredStats.locoId}`, 20, 43);

      const logTimes = filteredStats.maPackets.map(p => p.time).sort();
      if (logTimes.length > 0) {
        doc.text(`Log Duration: ${logTimes[0]} to ${logTimes[logTimes.length - 1]}`, 20, 48);
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('To,', 20, 55);
      doc.setFont('helvetica', 'normal');
      doc.text('The Senior Divisional Electrical Engineer (Rolling Stock),', 20, 62);
      doc.text('Traction Operations Department.', 20, 68);

      doc.setFont('helvetica', 'bold');
      const subjectText = `Subject: Deep Analysis & Failure Validation - Locomotive ${filteredStats.locoId}${selectedStation !== 'All' ? ' at ' + formatStationName(selectedStation) : ''}`;
      doc.text(subjectText, 20, 80);
      doc.line(20, 82, 160, 82);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      
      let bodyY = 92;
      const writeText = (text: string, y: number, size = 10, isBold = false) => {
        doc.setFontSize(size);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, 170);
        
        let currentY = y;
        lines.forEach((line: string) => {
          if (currentY > 280) {
            doc.addPage();
            currentY = 20;
            doc.setFontSize(size);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          }
          doc.text(line, 20, currentY);
          currentY += 5;
        });
        
        return currentY;
      };

      bodyY = writeText(`Sir,`, bodyY);
      const introText = `This letter provides a comprehensive technical audit of Locomotive ${filteredStats.locoId}${selectedStation !== 'All' ? ' at ' + formatStationName(selectedStation) : ''} based on real-time diagnostic logs. The analysis evaluates whether the reported system failure is technically justified (Genuine) or based on environmental/external factors (Flimsy).`;
      bodyY = writeText(introText, bodyY + 5);

      // 1. Technical Metrics Summary
      bodyY = writeText(`1. TECHNICAL PERFORMANCE METRICS:`, bodyY + 8, 11, true);
      
      const metricsData = [
        ['Metric', 'Value', 'Status'],
        ['Overall RFCOMM Success', `${filteredStats.locoPerformance.toFixed(2)}%`, filteredStats.locoPerformance >= 95 ? 'Healthy' : 'Sub-optimal'],
        ['NMS Software Health', `${(100 - filteredStats.nmsFailRate).toFixed(2)}%`, filteredStats.nmsFailRate <= 5 ? 'Healthy' : 'Critical'],
        ['Avg Radio MA Lag', `${filteredStats.avgLag.toFixed(2)}s`, filteredStats.avgLag <= 1.5 ? 'Normal' : 'High Latency'],
        ['Critical Tag Link Issues', `${filteredStats.tagLinkIssues.length}`, filteredStats.tagLinkIssues.length === 0 ? 'None' : 'Action Required']
      ];

      autoTable(doc, {
        startY: bodyY + 2,
        head: [metricsData[0]],
        body: metricsData.slice(1),
        theme: 'grid',
        styles: { fontSize: 9 },
        margin: { left: 20 }
      });
      bodyY = (doc as any).lastAutoTable.finalY + 8;

      // 2. Station-wise Performance Analysis
      bodyY = writeText(`2. STATION-SPECIFIC COMMUNICATION AUDIT:`, bodyY, 11, true);
      const stnData = filteredStats.stationStats
        .sort((a, b) => a.percentage - b.percentage)
        .slice(0, 5)
        .map(s => [formatStationName(s.stationId), s.direction, `${s.received}/${s.expected}`, `${s.percentage.toFixed(1)}%`]);

      if (stnData.length > 0) {
        autoTable(doc, {
          startY: bodyY + 2,
          head: [['Station ID', 'Direction', 'Packets (R/E)', 'Success %']],
          body: stnData,
          theme: 'striped',
          styles: { fontSize: 8 },
          margin: { left: 20 }
        });
        bodyY = (doc as any).lastAutoTable.finalY + 8;
      } else {
        bodyY = writeText(`No specific station communication drops detected.`, bodyY + 2);
      }

      // 3. Mode Degradation Analysis
      if (filteredStats.modeDegradations.length > 0) {
        bodyY = writeText(`3. MODE DEGRADATION AUDIT (TRNMSNMA):`, bodyY, 11, true);
        autoTable(doc, {
          startY: bodyY + 2,
          head: [['Timestamp', 'Station', 'From', 'To', 'Reason', 'LP Response']],
          body: filteredStats.modeDegradations.map(d => {
            const fStnId = formatStationName(d.stationId);
            const fStnName = formatStationName(d.stationName);
            const stnId = (fStnId !== 'N/A') ? fStnId : '';
            const stnName = (fStnName !== 'N/A') ? `\n(${fStnName})` : '';
            return [
              d.time, 
              `${stnId}${stnName}`.trim(), 
              d.from, 
              d.to, 
              d.reason, 
              d.lpResponse
            ];
          }),
          theme: 'grid',
          styles: { fontSize: 7 },
          margin: { left: 20 }
        });
        bodyY = (doc as any).lastAutoTable.finalY + 8;
      }

      // 3.5 NMS Health Audit
      if (filteredStats.nmsLocoStats && filteredStats.nmsLocoStats.length > 0) {
        if (bodyY > 240) { doc.addPage(); bodyY = 20; }
        bodyY = writeText(`NMS HEALTH AUDIT (HARDWARE FAULT DETECTION):`, bodyY, 11, true);
        bodyY = writeText(`NMS Health indicates the internal diagnostic status of the Loco Vital Computer (LVC). A value of '0' means healthy.`, bodyY, 9, false);
        
        autoTable(doc, {
          startY: bodyY + 2,
          head: [['Loco ID', 'Total Records', 'Errors (Non-Zero)', 'Error %', 'Status']],
          body: filteredStats.nmsLocoStats.map(d => [
            d.locoId,
            d.totalRecords.toLocaleString(),
            d.errors.toLocaleString(),
            `${d.errorPercentage}%`,
            d.category
          ]),
          theme: 'grid',
          styles: { fontSize: 8 },
          margin: { left: 20 }
        });
        bodyY = (doc as any).lastAutoTable.finalY + 8;

        if (filteredStats.nmsDeepAnalysis && filteredStats.nmsDeepAnalysis.length > 0) {
          if (bodyY > 240) { doc.addPage(); bodyY = 20; }
          bodyY = writeText(`Continuous Error Events (Deep Analysis):`, bodyY, 10, true);
          autoTable(doc, {
            startY: bodyY + 2,
            head: [['Loco ID', 'Station', 'Time Range', 'Code', 'Error Type', 'Count']],
            body: filteredStats.nmsDeepAnalysis.slice(0, 10).map(d => {
              const fStnId = formatStationName(d.stationId);
              const fStnName = formatStationName(d.stationName);
              const stnId = (fStnId !== 'N/A') ? fStnId : '';
              const stnName = (fStnName !== 'N/A' && fStnName !== '-' && fStnName !== '0') ? `\n(${fStnName})` : '';
              return [
                d.locoId,
                `${stnId}${stnName}`.trim(),
                `${d.startTime.split(' ')[1]} - ${d.endTime.split(' ')[1]}`,
                d.errorCode,
                d.errorType,
                d.count.toString()
              ];
            }),
            theme: 'grid',
            styles: { fontSize: 7 },
            margin: { left: 20 }
          });
          bodyY = (doc as any).lastAutoTable.finalY + 8;
        }
      }

      // 4. Chronological Event Log (Last 5 Critical Events)
      const events = [
        ...filteredStats.modeDegradations.map(e => ({ 
          time: e.time, 
          type: 'DEGRADATION', 
          detail: `${e.from} -> ${e.to} at ${formatStationName(e.stationName || e.stationId)} (${e.reason})` 
        })),
        ...filteredStats.sosEvents.map(e => ({ time: e.time, type: 'SOS', detail: `${e.type} from ${e.source} at ${formatStationName(e.stationId)}` })),
        ...filteredStats.brakeApplications.map(e => ({ time: e.time, type: 'BRAKE', detail: `${e.type} at ${e.speed} km/h near ${formatStationName(e.stationId)}` }))
      ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5);

      if (events.length > 0) {
        bodyY = writeText(`4. RECENT CRITICAL EVENTS LOG:`, bodyY, 11, true);
        autoTable(doc, {
          startY: bodyY + 2,
          head: [['Timestamp', 'Event Type', 'Technical Details']],
          body: events.map(e => [e.time, e.type, e.detail]),
          theme: 'grid',
          styles: { fontSize: 8 },
          margin: { left: 20 }
        });
        bodyY = (doc as any).lastAutoTable.finalY + 8;
      }

      // 5. Loco Overview Section
      bodyY = writeText(`5. LOCO OVERVIEW & DATA DURATION:`, bodyY, 11, true);
      bodyY = writeText(`Locomotive Number: ${filteredStats.locoId}`, bodyY + 2, 10);
      bodyY = writeText(`Analysis Duration: ${filteredStats.startTime} to ${filteredStats.endTime}`, bodyY + 2, 10);
      bodyY += 5;

      // 6. Expert Judgment Section (Correlation Logic)
      // A failure is GENUINE only if Internal Errors (NMS) correlate with External Symptoms (RF/Tags)
      // OR if there is a sustained Radio Timeout.
      const hasInternalFault = filteredStats.nmsFailRate > 40;
      const hasExternalSymptom = filteredStats.locoPerformance < 92 || filteredStats.tagLinkIssues.length > 2;
      const hasCriticalRadioLag = filteredStats.avgLag > 2.5;
      
      const isGenuine = (hasInternalFault && hasExternalSymptom) || hasCriticalRadioLag || (filteredStats.brakeApplications.length > 0 && filteredStats.locoPerformance < 85);
      
      const judgment = isGenuine ? "VALIDATED FUNCTIONAL FAILURE (SYSTEMIC)" : "NON-FUNCTIONAL DIAGNOSTIC ANOMALY (TRANSIENT)";
      const color = isGenuine ? [200, 0, 0] : [0, 150, 0];

      bodyY = writeText(`6. TECHNICAL VALIDATION & LOGICAL PROOF:`, bodyY + 5, 11, true);
      doc.setTextColor(color[0], color[1], color[2]);
      bodyY = writeText(`FINAL DECISION: ${judgment}`, bodyY + 2, 11, true);
      doc.setTextColor(0);

      let reasoning = "";
      if (isGenuine) {
        reasoning = `TECHNICAL VALIDATION: The failure is classified as FUNCTIONAL due to CORRELATION. `;
        if (hasInternalFault && hasExternalSymptom) {
          reasoning += `The system shows both Internal NMS instability (${filteredStats.nmsFailRate.toFixed(1)}%) AND External performance degradation (RF: ${filteredStats.locoPerformance.toFixed(1)}%). This proves that the NMS errors are not just 'noise' but are actively causing communication drops or hardware malfunctions. `;
        } else if (hasCriticalRadioLag) {
          reasoning += `The average Radio MA lag of ${filteredStats.avgLag.toFixed(2)}s exceeds the safety threshold, directly impacting train operation regardless of NMS status. `;
        }
        
        // Multi-Loco Station Proof
        if (filteredStats.multiLocoBadStns.length > 0) {
          const conciseStnList = filteredStats.multiLocoBadStns.map(s => {
            const ids = s.locoDetails.map(d => d.id).join(', ');
            return `${formatStationName(s.stationId)} (Locos: ${ids})`;
          }).join('; ');
          
          const detailedStnList = filteredStats.multiLocoBadStns.map(s => {
            const details = s.locoDetails.map(d => `${d.id}: ${d.perf.toFixed(1)}% [${d.startTime} - ${d.endTime}]`).join(', ');
            return `${formatStationName(s.stationId)} (Locos: ${details})`;
          }).join('; ');
          
          reasoning += `LOGICAL PROOF: The failure is marked as GENUINE. The performance drops are observed at [${conciseStnList}] across multiple locomotives. Since multiple locos are failing at the same spot, the fault lies with the Station TCAS equipment. The locomotive unit under analysis is performing normally elsewhere. \n\nDetailed Performance Audit: [${detailedStnList}]. `;
        }
        
        reasoning += `This confirms a hardware/software defect in the Loco Kavach Unit, but also highlights track-side infrastructure issues.`;
      } else {
        reasoning = `TECHNICAL VALIDATION: The failure is classified as NON-FUNCTIONAL/TRANSIENT. `;
        
        // Multi-Loco Station Proof for Flimsy Grounds
        if (filteredStats.multiLocoBadStns.length > 0) {
          const conciseStnList = filteredStats.multiLocoBadStns.map(s => {
            const ids = s.locoDetails.map(d => d.id).join(', ');
            return `${formatStationName(s.stationId)} (Locos: ${ids})`;
          }).join('; ');
          
          const detailedStnList = filteredStats.multiLocoBadStns.map(s => {
            const details = s.locoDetails.map(d => `${d.id}: ${d.perf.toFixed(1)}% [${d.startTime} - ${d.endTime}]`).join(', ');
            return `${formatStationName(s.stationId)} (Locos: ${details})`;
          }).join('; ');
          
          reasoning += `LOGICAL PROOF: The failure is marked as FLIMSY/WRONG. The performance drops are observed at [${conciseStnList}] across multiple locomotives. Since multiple locos are failing at the same spot, the fault lies with the Station TCAS equipment. The locomotive unit under analysis is performing normally elsewhere. \n\nDetailed Performance Audit: [${detailedStnList}]. `;
        } else if (hasInternalFault && !hasExternalSymptom) {
          reasoning += `Although NMS health is reported as sub-optimal (${filteredStats.nmsFailRate.toFixed(1)}% non-32 codes), the RFCOMM performance is stable at ${filteredStats.locoPerformance.toFixed(2)}% with 0 Tag issues. This indicates that the NMS codes are 'Transient' or 'Informational' and do not constitute a functional failure. `;
        } else if (filteredStats.badStns.length > 0 && filteredStats.badStns.length <= 2) {
          reasoning += `The performance drops are highly localized to ${filteredStats.badStns.map(id => formatStationName(id)).join(', ')}, proving that the issue is Track-side (RFID/Signal) and the Locomotive unit is healthy. `;
        }
        reasoning += `The locomotive is technically fit for operation.`;
      }
      bodyY = writeText(reasoning, bodyY + 2);

      // Recommendation
      bodyY = writeText(`7. RECOMMENDATION:`, bodyY + 8, 11, true);
      let recommendation = "";
      if (isGenuine) {
        if (filteredStats.multiLocoBadStns.length > 0) {
          const stnIds = filteredStats.multiLocoBadStns.map(s => formatStationName(s.stationId)).join(', ');
          recommendation = `1. URGENT: Inspect Station TCAS/Kavach equipment at Stations [${stnIds}] as multiple locomotives are failing there. 2. Perform a technical audit of the Loco Processing Unit (CPU) and Power Supply Module.`;
        } else if (filteredStats.nmsFailRate > 50 && filteredStats.badStns.length === 1) {
          recommendation = `1. Inspect Station Kavach equipment at ${formatStationName(filteredStats.badStns[0])} for CPU/Radio faults. 2. If the problem persists across other stations, replace the Loco Processing Unit (CPU) and check the Power Supply Module.`;
        } else {
          recommendation = `Immediate inspection of the Kavach antenna, RF cables, and NMS processing unit is required at the shed. The locomotive should be grounded for a full technical audit and recalibration.`;
        }
      } else {
        if (filteredStats.multiLocoBadStns.length > 0) {
          const stnIds = filteredStats.multiLocoBadStns.map(s => formatStationName(s.stationId)).join(', ');
          recommendation = `The locomotive is fit for service. The reported communication drops are due to faulty Station-side equipment at [${stnIds}]. URGENT track-side audit is required at these locations.`;
        } else {
          recommendation = `The locomotive is fit for service. No hardware replacement is required. It is recommended to audit the track-side Kavach equipment and signal strength at stations [${filteredStats.badStns.map(id => formatStationName(id)).join(', ')}] to resolve the localized communication drops.`;
        }
      }
      bodyY = writeText(recommendation, bodyY + 2);

      bodyY = writeText(recommendation, bodyY + 2);

      // ANNEX A: Deep Analysis Report
      doc.addPage();
      bodyY = 20;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 102, 204);
      doc.text('ANNEXURE A: DEEP DIAGNOSTIC ANALYSIS', 105, bodyY, { align: 'center' });
      doc.line(20, bodyY + 2, 190, bodyY + 2);
      
      bodyY += 15;
      doc.setFontSize(11);
      doc.setTextColor(0);
      bodyY = writeText(`Diagnostic Conclusion: ${filteredStats.stationDeepAnalysis.dashboard.conclusion}`, bodyY, 11, true);
      
      // Verdict Blocks
      const isLFaulty = filteredStats.stationDeepAnalysis.dashboard.conclusion.includes('Loco');
      const isSFaulty = filteredStats.stationDeepAnalysis.dashboard.conclusion.includes('Station');
      
      doc.setFillColor(245, 245, 245);
      doc.rect(20, bodyY + 5, 170, 20, 'F');
      doc.setFontSize(10);
      doc.text(`Loco ${filteredStats.locoId} Status:`, 25, bodyY + 12);
      doc.setTextColor(isLFaulty ? 200 : 0, isLFaulty ? 0 : 150, 0);
      doc.setFontSize(12);
      doc.text(isLFaulty ? 'SUSPECTED FAULTY' : 'CONDITION FIT', 65, bodyY + 12, { align: 'left' });
      
      doc.setTextColor(0);
      doc.setFontSize(10);
      doc.text(`Station Health:`, 25, bodyY + 20);
      doc.setTextColor(isSFaulty ? 180 : 0, isSFaulty ? 120 : 150, 0);
      doc.setFontSize(12);
      doc.text(isSFaulty ? 'TRACKSIDE ISSUES DETECTED' : 'TRACKSIDE HEALTHY', 65, bodyY + 20, { align: 'left' });
      
      bodyY += 35;
      doc.setTextColor(0);
      bodyY = writeText('Loco Journey Performance Map:', bodyY, 11, true);
      
      autoTable(doc, {
        startY: bodyY + 2,
        head: [['Station', `Loco ${filteredStats.locoId}`, 'Baaki Locos (Avg)']],
        body: filteredStats.stationDeepAnalysis.dashboard.problem1.table.map(r => [formatStationName(r.station), r.locoVal, r.othersAvg]),
        theme: 'grid',
        styles: { fontSize: 8 },
        margin: { left: 20 }
      });
      bodyY = (doc as any).lastAutoTable.finalY + 10;

      if (filteredStats.multiLocoBadStns.length > 0) {
        bodyY = writeText('Multi-Loco Station Cross-Check:', bodyY, 11, true);
        autoTable(doc, {
          startY: bodyY + 2,
          head: [['Station', 'Locos Failed', 'Avg Perf', 'Action Required']],
          body: filteredStats.multiLocoBadStns.map(s => {
            return [formatStationName(s.stationId), s.locoCount, `${s.avgPerf.toFixed(1)}%`, s.locoCount >= 3 ? 'PRIORITY' : 'INSPECT'];
          }),
          theme: 'grid',
          styles: { fontSize: 8 },
          margin: { left: 20 }
        });
        bodyY = (doc as any).lastAutoTable.finalY + 10;
      }

      bodyY = writeText('Root Cause Probability Analysis:', bodyY, 11, true);
      const rc = filteredStats.stationDeepAnalysis.rootCause;
      bodyY = writeText(`- Station-side: ${rc.stationSide}%`, bodyY + 2, 9);
      bodyY = writeText(`- Loco-side: ${rc.locoSide}%`, bodyY, 9);
      bodyY = writeText(`- Hardware Prob: ${rc.hardwareProb}%`, bodyY, 9);
      bodyY = writeText(`- Software Prob: ${rc.softwareProb}%`, bodyY, 9);

      bodyY += 5;
      doc.setFontSize(9);
      doc.setTextColor(0, 120, 0);
      doc.setFont('helvetica', 'italic');
      bodyY = writeText(filteredStats.stationDeepAnalysis.dashboard.amlConclusion, bodyY, 9);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');

      bodyY += 10;
      doc.setFillColor(0, 102, 204);
      doc.rect(20, bodyY, 170, 20, 'F');
      doc.setTextColor(255);
      doc.text('FINAL ACTION REQUIRED:', 25, bodyY + 8);
      const actionLines = doc.splitTextToSize(filteredStats.stationDeepAnalysis.dashboard.actionRequired, 160);
      doc.text(actionLines, 25, bodyY + 15);

      // Technical Note
      bodyY = writeText(`7. TECHNICAL NOTE:`, bodyY + 8, 10, true);
      const techNote = `Please note that while a locomotive may be mechanically 'Fit' and operational for traction, the 'Kavach Failure' status refers specifically to the Electronic Safety System. A high NMS failure rate indicates that the Kavach unit is unable to perform its safety-critical monitoring, which is a mandatory requirement for high-speed operations.`;
      bodyY = writeText(techNote, bodyY + 2, 9);

      // Footer - Dynamic placement
      bodyY += 10;
      // Threshold increased to 260 to allow more content on the same page
      if (bodyY > 260) {
        doc.addPage();
        bodyY = 25;
      }
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      bodyY = writeText('This is a computer-generated technical analysis based on uploaded Kavach diagnostic logs.', bodyY);
      
      bodyY += 15;
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      doc.text('Yours Sincerely,', 140, bodyY);
      
      bodyY += 8;
      doc.setFont('helvetica', 'bold');
      doc.text('CHIEF LOCO INSPECTOR', 140, bodyY);

      doc.save(`Failure_Analysis_Letter_Loco_${filteredStats.locoId}_${date.replace(/\//g, '-')}.pdf`);
    } catch (error) {
      console.error("Letter Generation Error:", error);
      alert("There was an issue generating the letter.");
    }
  };

  return (
    <div className="flex h-screen relative font-sans">
      <div className="atmosphere" />
      
      {/* Sidebar */}
      <aside className="w-72 glass-sidebar text-white p-6 flex flex-col gap-8 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
          <h1 className="text-xl font-bold tracking-tight text-white">Kavach Expert</h1>
        </div>

        {/* Mentorship Section */}
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
          <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-widest mb-1">Technical Supervision</p>
          <p className="text-sm font-semibold text-white">Mentored by CELE Sir</p>
          <p className="text-[10px] text-slate-400 mt-1 italic">Expert Guidance in Traction Operations</p>
        </div>

        {/* System Update Note */}
        <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3 h-3 text-emerald-400" />
            <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-widest">System Update</p>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            This dashboard can now analyze Kavach data even in the absence of <span className="text-emerald-400 font-semibold">RADIO_1</span> logs, which are often difficult to obtain. It automatically generates a detailed report on Loco TCAS health.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cloud Storage</h3>
            {!isAwsConnected ? (
              <button
                onClick={handleAwsConnect}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2 font-bold"
              >
                <Database className="w-4 h-4 text-orange-400" />
                Connect AWS S3
              </button>
            ) : (
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-bold text-slate-300">AWS S3 Connected</span>
                </div>
                <button onClick={handleAwsLogout} className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-tighter">
                  Logout
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Local Upload</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[9px] text-slate-500 uppercase font-bold px-1">RF Train</p>
                <label className="flex flex-col items-center justify-center w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <Upload className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-bold">{files.rf.length || 'Select'}</span>
                  </div>
                  <input type="file" className="hidden" multiple onChange={(e) => handleFileUpload('rf', e.target.files!)} />
                </label>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] text-slate-500 uppercase font-bold px-1">RF Station</p>
                <label className="flex flex-col items-center justify-center w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <Upload className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-bold">{files.rfSt.length || 'Select'}</span>
                  </div>
                  <input type="file" className="hidden" multiple onChange={(e) => handleFileUpload('rfSt', e.target.files!)} />
                </label>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] text-slate-500 uppercase font-bold px-1">TRN Logs</p>
                <label className="flex flex-col items-center justify-center w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <Upload className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-bold">{files.trn.length || 'Select'}</span>
                  </div>
                  <input type="file" className="hidden" multiple onChange={(e) => handleFileUpload('trn', e.target.files!)} />
                </label>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] text-slate-500 uppercase font-bold px-1">Radio 1</p>
                <label className="flex flex-col items-center justify-center w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <Upload className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-bold">{files.radio ? '1 File' : 'Select'}</span>
                  </div>
                  <input type="file" className="hidden" onChange={(e) => handleFileUpload('radio', e.target.files!)} />
                </label>
              </div>
            </div>
            {(files.rf.length > 0 || files.rfSt.length > 0 || files.trn.length > 0) && (
              <button
                onClick={analyzeData}
                disabled={isFetching}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                {isFetching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Analyze Local Files
              </button>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Analysis Controls</h3>
              <button onClick={checkAwsStatus} className="text-emerald-400 hover:text-emerald-300 transition-colors">
                <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
              </button>
            </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-3 h-3" /> Start Date
                  </label>
                  <select 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  >
                    <option value="All" className="bg-slate-900">Select Date</option>
                    {availableDates.map(d => (
                      <option key={d} value={d} className="bg-slate-900">{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-3 h-3" /> End Date
                  </label>
                  <select 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  >
                    <option value="All" className="bg-slate-900">Select Date</option>
                    {availableDates.map(d => (
                      <option key={d} value={d} className="bg-slate-900">{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="w-3 h-3" /> Loco ID (Optional)
                  </label>
                  <select 
                    value={cloudLoco}
                    onChange={(e) => setCloudLoco(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  >
                    <option value="All" className="bg-slate-900">All Locos</option>
                    {availableLocos.map(l => (
                      <option key={l} value={l} className="bg-slate-900">{l}</option>
                    ))}
                  </select>
                </div>

                {isAwsConnected && availableDates.length === 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">No Dates Found</p>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Connected to S3, but couldn't find dates in filenames. Ensure files follow a date format like DD-MM-YYYY or YYYYMMDD.
                    </p>
                  </div>
                )}

                <button
                  onClick={analyzeCloudData}
                  disabled={isFetching || startDate === 'All' || endDate === 'All'}
                  className={cn(
                    "w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
                    (!isFetching && startDate !== 'All' && endDate !== 'All')
                      ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20" 
                      : "bg-white/5 text-slate-500 cursor-not-allowed border border-white/5"
                  )}
                >
                  {isFetching ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Analyze AWS Data
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 z-10">
        {!stats ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 glass-card rounded-3xl flex items-center justify-center animate-pulse">
              <Shield className="w-12 h-12 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-white">Ready for Analysis</h2>
              <p className="text-slate-400 max-w-md mx-auto">
                Upload your Kavach RF and TRN logs to generate a comprehensive diagnostic report. 
                <span className="block mt-2 text-emerald-400/80 text-sm">Now supports analysis without RADIO_1 logs for faster reporting.</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-end">
                <div className="flex items-end gap-6">
                  <div>
                    <p className="text-emerald-400 font-bold text-sm tracking-widest uppercase mb-1">Diagnostic Report</p>
                    <h2 className="text-4xl font-bold text-white tracking-tight">Loco {stats.locoId}</h2>
                  </div>
                    <button 
                      onClick={generatePDFReport}
                      className="mb-1 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition-all text-sm font-bold"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      Download Official Report
                    </button>
                    <button 
                      onClick={generateFailureLetter}
                      className={cn(
                        "mb-1 flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-sm font-bold",
                        selectedLoco === 'All' 
                          ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border-emerald-500/30"
                      )}
                    >
                      <FileText className="w-4 h-4" />
                      {selectedLoco === 'All' ? 'Select Loco for Failure Letter' : 'Download Failure Analysis Letter'}
                    </button>
                  </div>
                <div className="flex gap-1 p-1 glass-card rounded-xl overflow-x-auto max-w-3xl">
                  <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} label="Summary" />
                  <TabButton active={activeTab === 'mapping'} onClick={() => setActiveTab('mapping')} label="Mapping" />
                  <TabButton active={activeTab === 'station'} onClick={() => setActiveTab('station')} label="Station Analysis" />
                  <TabButton active={activeTab === 'radio'} onClick={() => setActiveTab('radio')} label="Radio Analysis" />
                  <TabButton active={activeTab === 'expert'} onClick={() => setActiveTab('expert')} label="Expert Diagnostics" />
                  <TabButton active={activeTab === 'nms'} onClick={() => setActiveTab('nms')} label="NMS" />
                  <TabButton active={activeTab === 'sync'} onClick={() => setActiveTab('sync')} label="Sync" />
                  <TabButton active={activeTab === 'interval'} onClick={() => setActiveTab('interval')} label="Interval" />
                  <TabButton active={activeTab === 'moving'} onClick={() => setActiveTab('moving')} label="Moving Analysis" />
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 glass-card rounded-2xl border border-white/5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> Station
                  </label>
                  <select 
                    value={selectedStation}
                    onChange={(e) => setSelectedStation(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  >
                    {uniqueStations.map(stn => (
                      <option key={stn} value={stn} className="bg-slate-900">{stn === 'All' ? 'All Stations' : formatStationName(stn)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="w-3 h-3" /> Loco
                  </label>
                  <select 
                    value={selectedLoco}
                    onChange={(e) => setSelectedLoco(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  >
                    {uniqueLocos.map(loco => (
                      <option key={loco} value={loco} className="bg-slate-900">{loco}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-3 h-3" /> From Date
                  </label>
                  <select 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  >
                    <option value="All" className="bg-slate-900">All Dates</option>
                    {stats.allDates.map(d => (
                      <option key={d} value={d} className="bg-slate-900">{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-3 h-3" /> To Date
                  </label>
                  <select 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  >
                    <option value="All" className="bg-slate-900">All Dates</option>
                    {stats.allDates.map(d => (
                      <option key={d} value={d} className="bg-slate-900">{d}</option>
                    ))}
                  </select>
                </div>
                { (selectedStation !== 'All' || selectedLoco !== 'All' || startDate !== 'All' || endDate !== 'All') && (
                  <div className="md:col-span-4 flex justify-end">
                    <button 
                      onClick={() => { 
                        setSelectedStation('All'); 
                        setSelectedLoco('All'); 
                        setStartDate('All'); 
                        setEndDate('All'); 
                      }}
                      className="px-4 py-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/20 text-xs font-bold hover:bg-rose-500/30 transition-all"
                    >
                      Reset All Filters
                    </button>
                  </div>
                )}
              </div>
            </div>

            {activeTab === 'summary' && filteredStats && <ExecutiveSummary stats={filteredStats} />}
            {activeTab === 'mapping' && filteredStats && <DeepMapping stats={filteredStats} files={files} />}
            {activeTab === 'station' && filteredStats && <StationAnalysis stats={filteredStats} />}
            {activeTab === 'expert' && filteredStats && <ExpertDiagnostics stats={filteredStats} tagSearch={tagSearch} setTagSearch={setTagSearch} />}
            {activeTab === 'nms' && filteredStats && <NMSAnalysis stats={filteredStats} />}
            {activeTab === 'sync' && filteredStats && <SyncAnalysis stats={filteredStats} />}
            {activeTab === 'interval' && filteredStats && <IntervalAnalysis stats={filteredStats} />}
            {activeTab === 'radio' && filteredStats && <RadioLossAnalysis stats={filteredStats} />}
            {activeTab === 'moving' && filteredStats && <MovingAnalysis stats={filteredStats} />}
          </div>
        )}
      </main>
    </div>
  );
}

function StationAnalysis({ stats }: { stats: DashboardStats }) {
  // Group stats by station and source for comparison
  const stationComparison = stats.stationStats.reduce((acc: any[], curr) => {
    const existing = acc.find(a => a.stationId === curr.stationId);
    
    if (existing) {
      if (curr.source === 'station') {
        existing.stationExp = (existing.stationExp || 0) + (curr.expected || 0);
        existing.stationRec = (existing.stationRec || 0) + (curr.received || 0);
        existing.stationPerc = existing.stationExp > 0 ? (existing.stationRec / existing.stationExp) * 100 : 0;
      } else {
        existing.trainExp = (existing.trainExp || 0) + (curr.expected || 0);
        existing.trainRec = (existing.trainRec || 0) + (curr.received || 0);
        existing.trainPerc = existing.trainExp > 0 ? (existing.trainRec / existing.trainExp) * 100 : 0;
      }
    } else {
      acc.push({
        stationId: curr.stationId,
        trainExp: curr.source === 'station' ? 0 : (curr.expected || 0),
        trainRec: curr.source === 'station' ? 0 : (curr.received || 0),
        trainPerc: curr.source === 'station' ? null : (curr.expected > 0 ? (curr.received / curr.expected) * 100 : 0),
        stationExp: curr.source === 'station' ? (curr.expected || 0) : 0,
        stationRec: curr.source === 'station' ? (curr.received || 0) : 0,
        stationPerc: curr.source === 'station' ? (curr.expected > 0 ? (curr.received / curr.expected) * 100 : 0) : null,
        label: formatStationName(curr.stationId)
      });
    }
    return acc;
  }, []);

    const stationRecords = stats.stationStats.filter(s => s.source === 'station').length;
    const trainRecords = stats.stationStats.filter(s => s.source === 'train').length;
  
    const stationIds = Array.from(new Set(stats.stationStats.filter(s => s.source === 'station').map(s => s.stationId)));
    const trainLocoIds = Array.from(new Set(stats.stationStats.filter(s => s.source === 'train').map(s => s.locoId)));
  
    return (
      <div className="space-y-6">
        {/* Debug Info */}
        <div className="bg-slate-800 text-slate-300 p-4 rounded-xl text-xs font-mono space-y-2">
          <div className="flex flex-wrap gap-6">
            <div>Station Records: <span className={stationRecords > 0 ? "text-emerald-400" : "text-rose-400"}>{stationRecords}</span></div>
            <div>Train Records: <span className={trainRecords > 0 ? "text-emerald-400" : "text-rose-400"}>{trainRecords}</span></div>
            <div>Comparison Groups: <span className={stationComparison.length > 0 ? "text-emerald-400" : "text-rose-400"}>{stationComparison.length}</span></div>
            <div className="text-slate-500">|</div>
            <div>Raw Station Stats: {stats.stationStats.length}</div>
            <div>Unique Stations: {new Set(stats.stationStats.map(s => s.stationId)).size}</div>
            {stats.skippedRfRows > 0 && <div className="text-amber-400">Skipped Rows (No Stn ID): {stats.skippedRfRows}</div>}
          </div>
          <div className="text-[10px] text-slate-500 pt-2 border-t border-white/5 flex flex-col gap-1">
            <div>Detected Train IDs: {trainLocoIds.slice(0, 10).join(', ')} {trainLocoIds.length > 10 ? '...' : ''}</div>
            <div>Detected Station IDs: {stationIds.slice(0, 20).map(id => formatStationName(id)).join(', ')} {stationIds.length > 20 ? '...' : ''}</div>
          </div>
          {stationRecords === 0 && (
            <div className="text-rose-400 border-t border-white/5 pt-2 mt-2">
              ⚠️ No Station-side logs detected. Ensure you have uploaded files with "RFCOMM_ST" in the name or folder.
            </div>
          )}
        </div>

      {/* Deep Analysis Dashboard */}
      {stats.stationDeepAnalysis.dashboard && (
        <div className="glass-card p-8 rounded-3xl border-2 border-emerald-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Zap className="w-32 h-32 text-emerald-400" />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
                  <ShieldCheck className="w-8 h-8 text-emerald-400" />
                  Deep Analysis — Packet Loss Root Cause
                </h2>
                <p className="text-emerald-400 font-bold mt-1 uppercase tracking-widest text-xs">
                  Conclusion: {stats.stationDeepAnalysis.dashboard.conclusion}
                </p>
              </div>
              <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <span className="text-emerald-400 text-xs font-black uppercase tracking-tighter animate-pulse">Live Diagnostic Active</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Problem 1 */}
              <div className="space-y-4 bg-white/5 p-6 rounded-2xl border border-white/10">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                  {stats.stationDeepAnalysis.dashboard.problem1.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {stats.stationDeepAnalysis.dashboard.problem1.description}
                </p>
                
                <div className="overflow-hidden rounded-xl border border-white/5">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-500 uppercase font-bold">
                      <tr>
                        <th className="p-3">Station</th>
                        <th className="p-3 text-rose-400">Loco {stats.locoId}</th>
                        <th className="p-3 text-emerald-400">Baaki Locos (Avg)</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {stats.stationDeepAnalysis.dashboard.problem1.table.map((row, idx) => (
                        <tr key={idx} className="border-t border-white/5">
                          <td className="p-3 font-bold">{formatStationName(row.station)}</td>
                          <td className="p-3 font-black text-rose-400">{row.locoVal}</td>
                          <td className="p-3 font-bold text-emerald-400">{row.othersAvg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Possible Causes:</p>
                  <ul className="space-y-1">
                    {stats.stationDeepAnalysis.dashboard.problem1.causes.map((cause, idx) => (
                      <li key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                        <span className="text-rose-500 mt-1">•</span> {cause}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Problem 2 & AML */}
              <div className="space-y-6">
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                    {stats.stationDeepAnalysis.dashboard.problem2.title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed mt-2">
                    {stats.stationDeepAnalysis.dashboard.problem2.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-full mb-1">Priority Order:</span>
                    {stats.stationDeepAnalysis.dashboard.problem2.priority.map((stn, idx) => (
                      <span key={idx} className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold rounded-lg">
                        {idx + 1}. {formatStationName(stn)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-emerald-500/5 p-6 rounded-2xl border border-emerald-500/10">
                  <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Station Performance Benchmark
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed mt-2 italic">
                    {stats.stationDeepAnalysis.dashboard.amlConclusion}
                  </p>
                </div>

                <div className="bg-emerald-500 p-6 rounded-2xl shadow-xl shadow-emerald-500/20">
                  <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-tighter">
                    <AlertTriangle className="w-6 h-6 text-white animate-bounce" />
                    Action Required
                  </h3>
                  <p className="text-white/90 text-sm font-bold mt-2 leading-relaxed">
                    {stats.stationDeepAnalysis.dashboard.actionRequired}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Root Cause Analysis Card */}
      <div className="glass-card p-8 rounded-2xl border-l-4 border-emerald-500 bg-emerald-500/5">
        <div className="flex items-start gap-6">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-500/20">
            <Activity className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-white">Root Cause Analysis Conclusion</h3>
            <p className="text-slate-300 leading-relaxed text-lg font-medium">
              {stats.stationDeepAnalysis.rootCause.conclusion}
            </p>
            <div className="flex flex-wrap gap-8 mt-4">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Station-Side Probability</p>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${stats.stationDeepAnalysis.rootCause.stationSide}%` }} />
                  </div>
                  <span className="text-sm font-bold text-emerald-400">{stats.stationDeepAnalysis.rootCause.stationSide}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Train-Side Probability</p>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500" style={{ width: `${stats.stationDeepAnalysis.rootCause.locoSide}%` }} />
                  </div>
                  <span className="text-sm font-bold text-rose-400">{stats.stationDeepAnalysis.rootCause.locoSide}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Hardware Issue Prob.</p>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${stats.stationDeepAnalysis.rootCause.hardwareProb}%` }} />
                  </div>
                  <span className="text-sm font-bold text-amber-400">{stats.stationDeepAnalysis.rootCause.hardwareProb}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Software/Config Prob.</p>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${stats.stationDeepAnalysis.rootCause.softwareProb}%` }} />
                  </div>
                  <span className="text-sm font-bold text-blue-400">{stats.stationDeepAnalysis.rootCause.softwareProb}%</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-slate-400 text-sm italic">
                <span className="font-bold text-slate-300 not-italic uppercase text-[10px] mr-2">Technical Breakdown:</span>
                {stats.stationDeepAnalysis.rootCause.breakdown}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-8 rounded-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-400" />
            Station-wise RFCOMM Performance (Train vs Station Perspective)
          </h3>
          <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded" /> Train View</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded" /> Station View</div>
          </div>
        </div>
        
        <div className="h-[500px] w-full flex items-center justify-center">
          {stationComparison.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={stationComparison} 
                margin={{ bottom: 70 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  stroke="#64748b" 
                  fontSize={10}
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis 
                  stroke="#64748b" 
                  domain={[0, 100]} 
                  fontSize={10}
                  label={{ value: 'RFCOMM Success %', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <ReferenceLine 
                  y={95} 
                  stroke="#f43f5e" 
                  strokeDasharray="3 3" 
                  label={{ 
                    value: '95% Threshold', 
                    position: 'right', 
                    fill: '#f43f5e', 
                    fontSize: 10,
                    fontWeight: 'bold'
                  }} 
                />
                <Bar dataKey="trainPerc" name="Train View" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="stationPerc" name="Station View" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center space-y-4 py-12">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                <BarChart3 className="w-10 h-10 text-slate-600" />
              </div>
              <div className="space-y-2">
                <p className="text-slate-400 font-medium">No RFCOMM data available for comparison</p>
                <p className="text-slate-500 text-sm max-w-md mx-auto">
                  {stats.stationStats.length === 0 
                    ? "No RFCOMM records were found in the processed files. Please check if the uploaded logs contain RFCOMM performance data."
                    : `Found ${stats.stationStats.length} RFCOMM records, but they couldn't be matched for comparison. Ensure station IDs and directions are consistent between Train and Station logs.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Detailed RFCOMM Log Mapping</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500 uppercase text-[10px] font-bold border-b border-white/5">
              <tr>
                <th className="pb-3 px-4">Source</th>
                <th className="pb-3 px-4">Loco ID</th>
                <th className="pb-3 px-4">Station ID</th>
                <th className="pb-3 px-4">Direction</th>
                <th className="pb-3 px-4">Expected</th>
                <th className="pb-3 px-4">Received</th>
                <th className="pb-3 px-4">Success %</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {stats.stationStats.map((s, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      s.source === 'station' ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"
                    )}>
                      {s.source || 'Train'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-emerald-400">{s.locoId}</td>
                  <td className="py-3 px-4 font-bold text-white">
                    {formatStationName(s.stationId)}
                  </td>
                  <td className="py-3 px-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      (s.direction || '').toLowerCase().includes('nominal') ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                    )}>
                      {s.direction}
                    </span>
                  </td>
                  <td className="py-3 px-4">{s.expected}</td>
                  <td className="py-3 px-4">{s.received}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full", s.percentage < 95 ? "bg-rose-500" : "bg-emerald-500")} 
                          style={{ width: `${s.percentage}%` }} 
                        />
                      </div>
                      <span className={cn("font-bold", s.percentage < 95 ? "text-rose-400" : "text-emerald-400")}>
                        {s.percentage.toFixed(2)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ExpertDiagnostics({ stats, tagSearch, setTagSearch }: { stats: DashboardStats; tagSearch: string; setTagSearch: (v: string) => void }) {
  const filteredTags = stats.tagLinkIssues.filter(t => 
    (t.info || '').toLowerCase().includes((tagSearch || '').toLowerCase()) || 
    (t.error || '').toLowerCase().includes((tagSearch || '').toLowerCase()) ||
    (t.stationId || '').toLowerCase().includes((tagSearch || '').toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Mode Degradation */}
      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-rose-400" />
          Mode Degradation Events
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500 uppercase text-[10px] font-bold border-b border-white/5">
              <tr>
                <th className="pb-3 px-4">Time</th>
                <th className="pb-3 px-4">Station</th>
                <th className="pb-3 px-4">From</th>
                <th className="pb-3 px-4">To</th>
                <th className="pb-3 px-4">Reason</th>
                <th className="pb-3 px-4">LP Response</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {stats.modeDegradations.length > 0 ? stats.modeDegradations.map((d, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs">{d.time}</td>
                  <td className="py-3 px-4 text-white">
                    {formatStationName(d.stationId) !== 'N/A' && (
                      <div className="font-bold">
                        {formatStationName(d.stationId)}
                      </div>
                    )}
                    {d.stationName && d.stationName !== 'N/A' && d.stationName !== '-' && d.stationName !== '0' && (
                      <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-tight">
                        {formatStationName(d.stationName) !== 'N/A' ? formatStationName(d.stationName) : ''}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">{d.from}</span></td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded text-[10px] font-bold">{d.to}</span></td>
                  <td className="py-3 px-4 font-semibold text-rose-300">
                    <span className="text-slate-500 text-[10px] block uppercase mb-0.5">Reason</span>
                    {d.reason}
                  </td>
                  <td className="py-3 px-4 italic text-slate-400 text-xs">{d.lpResponse}</td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">No mode degradation events detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NMS Health Audit */}
      {stats.nmsLocoStats && stats.nmsLocoStats.length > 0 && (
        <div className="glass-card p-6 rounded-3xl border border-white/5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            NMS Health Audit (Hardware Fault Detection)
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            NMS Health indicates the internal diagnostic status of the Loco Vital Computer (LVC). A value of '0' means healthy. High error percentages indicate hardware module failures (e.g., BIU Interface, RFID Reader) or internal communication issues.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500 uppercase text-[10px] font-bold border-b border-white/5">
                <tr>
                  <th className="pb-3 px-4">Loco ID</th>
                  <th className="pb-3 px-4 text-right">Total Records</th>
                  <th className="pb-3 px-4 text-right">Errors (Non-Zero)</th>
                  <th className="pb-3 px-4 text-right">Error %</th>
                  <th className="pb-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {stats.nmsLocoStats.map((d, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">{d.locoId}</td>
                    <td className="py-3 px-4 text-right font-mono text-xs">{d.totalRecords.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-rose-400">{d.errors.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-bold">{d.errorPercentage}%</td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                        d.category.includes('Critical') ? "bg-rose-500/20 text-rose-400" :
                        d.category.includes('High') ? "bg-amber-500/20 text-amber-400" :
                        "bg-emerald-500/20 text-emerald-400"
                      )}>
                        {d.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
               <h4 className="text-sm font-bold text-white mb-2">Technical Conclusion</h4>
               <p className="text-xs text-slate-400 leading-relaxed">
                 Continuous '8' or '16' codes are early warnings of specific card failures (e.g., Input Output Card or Communication Card). Locos in the "Critical" or "High" categories require immediate maintenance attention.
               </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
               <h4 className="text-sm font-bold text-white mb-2">Impact on System</h4>
               <p className="text-xs text-slate-400 leading-relaxed">
                 When NMS Health is not '0', it can cause the Kavach system to downgrade from Full Supervision (FS) to Staff Responsible (SR) or Isolate mode, and can also increase radio packet drops.
               </p>
            </div>
          </div>

          {/* Deep Analysis Table */}
          {stats.nmsDeepAnalysis && stats.nmsDeepAnalysis.length > 0 && (
            <div className="mt-8">
              <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wider text-slate-400">Continuous Error Events (Deep Analysis)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500 uppercase text-[10px] font-bold border-b border-white/5">
                    <tr>
                      <th className="pb-3 px-4">Loco ID</th>
                      <th className="pb-3 px-4">Station</th>
                      <th className="pb-3 px-4">Time Range</th>
                      <th className="pb-3 px-4">Code</th>
                      <th className="pb-3 px-4">Error Type</th>
                      <th className="pb-3 px-4">Count</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {stats.nmsDeepAnalysis.slice(0, 15).map((d, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 font-bold text-white">{d.locoId}</td>
                        <td className="py-3 px-4">
                          {formatStationName(d.stationId) !== 'N/A' && (
                            <div className="font-bold">{formatStationName(d.stationId)}</div>
                          )}
                          {d.stationName && d.stationName !== 'N/A' && d.stationName !== '-' && d.stationName !== '0' && (
                            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-tight">
                              {formatStationName(d.stationName)}
                            </div>
                          )}
                          {formatStationName(d.stationId) === 'N/A' && (!d.stationName || d.stationName === 'N/A' || d.stationName === '-' || d.stationName === '0') && (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {d.startTime.split(' ')[1]} - {d.endTime.split(' ')[1]}
                        </td>
                        <td className="py-3 px-4 font-mono text-rose-400 font-bold">{d.errorCode}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{d.errorType}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 max-w-xs truncate" title={d.description}>{d.description}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-amber-400">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        {/* Brake Applications */}
        <div className="glass-card p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Brake Applications by Kavach
          </h3>
          <div className="space-y-3">
            {stats.brakeApplications.length > 0 ? stats.brakeApplications.map((b, i) => (
              <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-white">{b.type}</p>
                  <p className="text-[10px] text-slate-500">{b.time} | Loc: {b.location}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-400">{b.speed} Kmph</p>
                </div>
              </div>
            )) : <p className="text-center py-4 text-slate-500 text-sm">No brake applications logged.</p>}
          </div>
        </div>

        {/* SOS Events */}
        <div className="glass-card p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            SOS Events
          </h3>
          <div className="space-y-3">
            {stats.sosEvents.length > 0 ? stats.sosEvents.map((s, i) => (
              <div key={i} className="bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-rose-400">SOS Triggered</p>
                  <p className="text-[10px] text-slate-500">{s.time} | Source: {s.source}</p>
                </div>
                <div className="text-right">
                  <span className="px-2 py-1 bg-rose-500 text-white rounded text-[10px] font-bold uppercase tracking-tighter">Critical</span>
                </div>
              </div>
            )) : <p className="text-center py-4 text-slate-500 text-sm">No SOS events detected.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Signal Overrides */}
        <div className="glass-card p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Signal Override Cases
          </h3>
          <div className="space-y-3">
            {stats.signalOverrides.length > 0 ? stats.signalOverrides.map((s, i) => (
              <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-white">Signal ID: {s.signalId}</p>
                  <p className="text-[10px] text-slate-500">{s.time}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-blue-400">{s.status}</span>
                </div>
              </div>
            )) : <p className="text-center py-4 text-slate-500 text-sm">No signal override cases found.</p>}
          </div>
        </div>

        {/* Loco Length Variations (TRNMSNMA) */}
        <div className="glass-card p-6 rounded-2xl border-t-4 border-amber-500 col-span-2">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            Loco Length Variations (TRNMSNMA)
          </h3>
          <div className="space-y-4">
            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
              <p className="text-xs text-slate-400 uppercase font-bold mb-4">Unique Lengths Detected with Context</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.uniqueTrainLengths.length > 0 ? stats.uniqueTrainLengths.map((item, i) => (
                  <div key={i} className={cn(
                    "p-3 rounded-xl border flex flex-col gap-1",
                    stats.uniqueTrainLengths.length > 1 ? "bg-rose-500/10 border-rose-500/20" : "bg-emerald-500/10 border-emerald-500/20"
                  )}>
                    <div className="flex justify-between items-center">
                      <span className={cn(
                        "text-lg font-bold",
                        stats.uniqueTrainLengths.length > 1 ? "text-rose-400" : "text-emerald-400"
                      )}>{item.length} m</span>
                      <span className="text-[10px] font-mono text-slate-500">{item.time}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <MapPin className="w-3 h-3" />
                      <span>Station: {formatStationName(item.stationId)}</span>
                    </div>
                  </div>
                )) : <p className="text-slate-500 text-sm italic">No length data found</p>}
              </div>
              
              {stats.uniqueTrainLengths.length > 1 && (
                <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
                  <div>
                    <p className="text-sm text-rose-300 font-bold uppercase tracking-tight">Critical Alert: Multiple Train Lengths Detected</p>
                    <p className="text-xs text-rose-400/80 mt-1">
                      Variations in reported train length (from {stats.uniqueTrainLengths[0].length}m to {stats.uniqueTrainLengths[stats.uniqueTrainLengths.length-1].length}m) detected for Loco {stats.locoId}. 
                      This is a critical safety concern as it affects braking distance calculations and EBD/SBD curves.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Medha Kavach / Tag Link Issues */}
      <div className="glass-card p-6 rounded-2xl border-l-4 border-rose-500">
        <div className="flex flex-col gap-6 mb-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Info className="w-5 h-5 text-rose-400" />
              Medha Kavach / Tag Link Info Issues
            </h3>
            <div className="flex gap-4">
              <div className="bg-rose-500/10 px-4 py-2 rounded-xl border border-rose-500/20">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Main Tag Missing</p>
                <p className="text-xl font-bold text-rose-400">
                  {stats.tagLinkIssues.filter(t => t.error === "Main Tag Missing").length}
                </p>
              </div>
              <div className="bg-amber-500/10 px-4 py-2 rounded-xl border border-amber-500/20">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Duplicate Tag Missing</p>
                <p className="text-xl font-bold text-amber-400">
                  {stats.tagLinkIssues.filter(t => t.error === "Duplicate Tag Missing").length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <input 
              type="text"
              placeholder="Search Tag Issues (e.g. Main Tag Missing, Station ID...)"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
              <button 
                onClick={() => setTagSearch('Main Tag Missing')}
                className="text-[10px] font-bold uppercase tracking-tighter bg-rose-500/20 text-rose-400 px-2 py-1 rounded hover:bg-rose-500/30 transition-all"
              >
                Find Main Missing
              </button>
              <button 
                onClick={() => setTagSearch('Duplicate Tag Missing')}
                className="text-[10px] font-bold uppercase tracking-tighter bg-amber-500/20 text-amber-400 px-2 py-1 rounded hover:bg-amber-500/30 transition-all"
              >
                Find Duplicate Missing
              </button>
              {tagSearch && (
                <button 
                  onClick={() => setTagSearch('')}
                  className="text-[10px] font-bold uppercase tracking-tighter bg-white/10 text-slate-400 px-2 py-1 rounded hover:bg-white/20 transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500 uppercase text-[10px] font-bold border-b border-white/5">
              <tr>
                <th className="pb-3 px-4">Time</th>
                <th className="pb-3 px-4">Station ID</th>
                <th className="pb-3 px-4">Tag Link Info</th>
                <th className="pb-3 px-4">Diagnostic Error</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {filteredTags.length > 0 ? filteredTags.map((t, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs">{t.time}</td>
                  <td className="py-3 px-4 font-bold text-white">
                    {formatStationName(t.stationId)}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-rose-300">{t.info}</td>
                  <td className="py-3 px-4">
                    <span className={cn(
                      "font-bold",
                      t.error === "Main Tag Missing" ? "text-rose-400" : 
                      t.error === "Duplicate Tag Missing" ? "text-amber-400" : "text-rose-400"
                    )}>
                      {t.error}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="py-8 text-center text-slate-500">No matching tag issues found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Short Packets */}
      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          Packet Length Analysis (Below 10 Bytes)
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {stats.shortPackets.length > 0 ? stats.shortPackets.map((p, i) => (
            <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5">
              <p className="text-[10px] font-bold text-white truncate">{p.type}</p>
              <div className="flex justify-between items-center mt-1">
                <span className="text-[9px] text-slate-500">{p.time}</span>
                <span className="text-[10px] font-bold text-rose-400">Len: {p.length}</span>
              </div>
            </div>
          )) : <p className="col-span-4 text-center py-4 text-slate-500 text-sm">No short packets detected.</p>}
        </div>
      </div>
    </div>
  );
}

function NMSAnalysis({ stats }: { stats: DashboardStats }) {
  const nmsColors: Record<string, string> = {
    '0': '#0066cc', '8': '#80ccff', '1': '#ff3333', '-': '#ffb3b3',
    '16': '#33b3a6', '32': '#80ffaa', '40': '#ff9900', 'default': '#64748b'
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-8 rounded-2xl">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Database className="w-6 h-6 text-emerald-400" />
          NMS Health Status Correlation
        </h3>
        <div className="grid grid-cols-2 gap-8 items-center">
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.nmsStatus}
                  cx="50%" cy="50%"
                  outerRadius={120}
                  innerRadius={60}
                  dataKey="value"
                  minAngle={15}
                  labelLine={true}
                  label={({ name, percent }) => percent > 0.05 ? `${name}: ${(percent * 100).toFixed(1)}%` : ''}
                >
                  {stats.nmsStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={nmsColors[entry.name] || nmsColors.default} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
              <p className="text-sm text-slate-400 mb-2">Failure Rate Analysis</p>
              <p className="text-4xl font-bold text-rose-400">{stats.nmsFailRate.toFixed(1)}%</p>
              <p className="text-xs text-slate-500 mt-2">Percentage of logs where NMS Health was not 0.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {stats.nmsStatus.map((d, i) => (
                <div key={i} className="bg-white/5 p-3 rounded-xl flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: nmsColors[d.name] || nmsColors.default }} />
                  <span className="text-xs text-slate-300 font-mono">{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncAnalysis({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      <div className="glass-card p-8 rounded-2xl">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Activity className="w-6 h-6 text-emerald-400" />
          Movement Authority (MA) Packet Sync Analysis
        </h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.maPackets}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" hide />
              <YAxis stroke="#64748b" label={{ value: 'Delay (s)', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }}
                itemStyle={{ color: '#10b981' }}
              />
              <Line 
                type="monotone" 
                dataKey="delay" 
                stroke="#10b981" 
                strokeWidth={2} 
                dot={false}
                activeDot={{ r: 4, fill: '#10b981' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-6">
          <div className="bg-white/5 p-4 rounded-xl">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Avg Refresh Lag</p>
            <p className="text-2xl font-bold text-white">{stats.avgLag.toFixed(2)}s</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Total MA Packets</p>
            <p className="text-2xl font-bold text-white">{stats.maCount}</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Access Requests</p>
            <p className="text-2xl font-bold text-white">{stats.arCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntervalAnalysis({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      <div className="glass-card p-8 rounded-2xl">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-emerald-400" />
          Packet Interval Distribution (RDSO Compliance)
        </h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.intervalDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="category" stroke="#64748b" />
              <YAxis stroke="#64748b" unit="%" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Bar dataKey="percentage" radius={[8, 8, 0, 0]}>
                {stats.intervalDist.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#10b981', '#f59e0b', '#ef4444'][index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-8 p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
          <p className="text-sm text-slate-300 leading-relaxed">
            <span className="font-bold text-emerald-400 mr-2">RDSO Standard:</span>
            Movement Authority (MA) packets must be refreshed every 1.0 seconds. Any delay exceeding 1.2 seconds triggers a session drop by the Loco system. Currently, <span className="font-bold text-white">{stats.intervalDist[0].percentage.toFixed(1)}%</span> of your packets are within the healthy range.
          </p>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-6 py-2 rounded-lg text-sm font-bold transition-all",
        active ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:text-white"
      )}
    >
      {label}
    </button>
  );
}

function StatusBox({ title, items }: { title: string; items: { label: string; status: string; reason: string }[] }) {
  return (
    <div className="glass-card p-6 rounded-2xl space-y-4">
      <h4 className="font-bold text-white text-sm uppercase tracking-wider opacity-70">{title}</h4>
      <div className="grid grid-cols-2 gap-4">
        {items.map((item, i) => (
          <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase">{item.label}</span>
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter",
                item.status === 'Healthy' ? "bg-emerald-500/20 text-emerald-400" : 
                item.status === 'Marginal' ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"
              )}>
                {item.status}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{item.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutiveSummary({ stats }: { stats: DashboardStats }) {
  const nmsColors: Record<string, string> = {
    '0': '#0066cc',
    '8': '#80ccff',
    '1': '#ff3333',
    '-': '#ffb3b3',
    '16': '#33b3a6',
    '32': '#80ffaa',
    '40': '#ff9900',
    'default': '#64748b'
  };

  return (
    <div className="grid grid-cols-3 gap-8">
      <div className="col-span-2 space-y-6 min-w-0">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-400" />
          System-Level Insights
        </h3>
        
        <div className="grid gap-4">
          <StatusBox 
            title="1. Hardware Analysis"
            items={[
              { label: "Locomotives Analyzed", status: "Healthy", reason: `Total ${stats.locoIds.length} unique locomotives identified: ${stats.locoIds.join(', ')}.` },
              { label: `Loco ${stats.locoId} Performance`, status: stats.locoPerformance >= 98 ? "Healthy" : "Marginal", reason: `Loco ${stats.locoId} achieved ${stats.locoPerformance.toFixed(1)}% performance across all stations.` },
              { label: "Station Hardware", status: stats.badStns.length > 0 ? "Marginal" : "Healthy", reason: stats.badStns.length > 0 ? `Significant drops detected at ${stats.badStns.map(id => formatStationName(id)).join(', ')}.` : "All stations performing optimally." }
            ]}
          />

          <StatusBox 
            title="2. Protocol Analysis"
            items={[
              { label: "Sync Analysis", status: stats.avgLag <= 1.2 ? "Healthy" : "Marginal", reason: `AR: ${stats.arCount} | MA: ${stats.maCount}. Ratio: ${((stats.maCount / (stats.arCount || 1)) * 100).toFixed(1)}%.` },
              { label: "Packet Interval Analysis", status: stats.avgLag <= 1.0 ? "Healthy" : "Marginal", reason: `Average MA interval: ${stats.avgLag.toFixed(2)}s. RDSO standard is 1.0s.` }
            ]}
          />
          
          <div className="glass-card p-6 rounded-2xl border-l-4 border-emerald-500 space-y-4">
            <h4 className="font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Root Cause Analysis Conclusion
            </h4>
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
              <p className="text-sm text-slate-200 leading-relaxed font-medium">
                {stats.stationDeepAnalysis.rootCause.conclusion}
              </p>
              <div className="flex gap-6 mt-4 pt-4 border-t border-white/5">
                <div className="flex-1 space-y-1">
                  <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Station-Side</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${stats.stationDeepAnalysis.rootCause.stationSide}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400">{stats.stationDeepAnalysis.rootCause.stationSide}%</span>
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Train-Side</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500" style={{ width: `${stats.stationDeepAnalysis.rootCause.locoSide}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-rose-400">{stats.stationDeepAnalysis.rootCause.locoSide}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border-l-4 border-emerald-500 space-y-4">
            <h4 className="font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-emerald-400" />
              Dynamic Diagnostic Advice
            </h4>
            <div className="space-y-4">
              {stats.diagnosticAdvice.map((advice, i) => (
                <div key={i} className={cn(
                  "p-4 rounded-xl border backdrop-blur-sm",
                  advice.severity === 'high' ? "bg-rose-500/10 border-rose-500/20" : 
                  advice.severity === 'medium' ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"
                )}>
                  <p className="font-bold text-sm mb-1 text-white">{advice.title}</p>
                  <p className="text-xs text-slate-400 mb-2">{advice.detail}</p>
                  <div className="flex gap-2 items-start mt-2 pt-2 border-t border-white/5">
                    <Zap className="w-3 h-3 mt-0.5 text-emerald-400" />
                    <p className="text-xs font-medium text-slate-300"><span className="text-slate-500 uppercase text-[9px] font-bold mr-1">Action:</span> {advice.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 min-w-0">
        <div className="glass-card p-6 rounded-2xl">
          <h4 className="font-bold text-white text-sm mb-6 uppercase tracking-wider opacity-70">Interval Distribution</h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.intervalDist}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="percentage"
                >
                  {stats.intervalDist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#10b981', '#f59e0b', '#ef4444'][index]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {stats.intervalDist.map((d, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-slate-400">{d.category}</span>
                <span className="font-bold text-white">{d.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl">
          <h4 className="font-bold text-white text-sm mb-4 uppercase tracking-wider opacity-70">NMS Status Correlation</h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.nmsStatus}
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  dataKey="value"
                  labelLine={false}
                  label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                >
                  {stats.nmsStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={nmsColors[entry.name] || nmsColors.default} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {stats.nmsStatus.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: nmsColors[d.name] || nmsColors.default }} />
                <span className="text-slate-400 truncate">{d.name}:</span>
                <span className="font-bold text-white">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeepMapping({ stats, files }: { stats: DashboardStats; files: { rf: File[]; trn: File[]; radio: File | null } }) {
  const failures = [
    {
      id: 1,
      title: `NMS Health Critical Failure (${stats.nmsFailRate.toFixed(1)}%)`,
      source: files.trn.length > 0 ? files.trn.map(f => f.name).join(', ') : 'N/A',
      column: "'NMS Health'",
      detail: `The NMS Health column should ideally maintain a value of 0 (Healthy). Your data contains anomalous values in ${stats.nmsFailRate.toFixed(1)}% of rows, indicating persistent hardware or internal communication issues.`
    },
    {
      id: 2,
      title: "Session Persistence / Access Request Ratio",
      source: files.radio?.name || 'N/A',
      column: "'Packet Type'",
      detail: `The system transmitted ${stats.arCount} Access Requests, but only ${stats.maCount} Movement Authorities were registered. This significant mismatch confirms session stability failures.`
    },
    {
      id: 3,
      title: "Station Hardware Marginal Status",
      source: files.rf.length > 0 ? files.rf.map(f => f.name).join(', ') : 'N/A',
      column: "'Station Id' and 'Percentage'",
      detail: `Average percentage analysis indicates that signal strength at stations ${stats.badStns.join(', ') || 'None'} has fallen below the 95% threshold.`
    },
    {
      id: 4,
      title: "Sync Loss / Refresh Lag Analysis",
      source: files.radio?.name || 'N/A',
      column: "'Time'",
      detail: `The average interval between MA packets was recorded at ${stats.avgLag.toFixed(2)} seconds. Any deviation from the RDSO standard (1.0s) triggers a session drop by the Loco system.`
    },
    ...(stats.modeDegradations.length > 0 ? [{
      id: 5,
      title: `Mode Degradation Events (${stats.modeDegradations.length})`,
      source: files.trn.length > 0 ? files.trn.map(f => f.name).join(', ') : 'N/A',
      column: "'Mode' and 'Reason'",
      detail: `The system recorded ${stats.modeDegradations.length} instances where the Kavach mode was downgraded (e.g., FS to OS/SR). Primary reasons detected: ${Array.from(new Set(stats.modeDegradations.map(d => d.reason))).slice(0, 3).join(', ')}.`
    }] : [])
  ];

  return (
    <div className="space-y-6">
      <div className="bg-blue-500/10 border-l-4 border-blue-500 p-4 rounded-r-xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400" />
          <p className="text-sm text-blue-200 font-medium">This tab is dynamically updated based on the real-time analysis of your uploaded logs.</p>
        </div>
      </div>

      <div className="grid gap-6">
        {failures.map((f) => (
          <div key={f.id} className="glass-card p-6 rounded-2xl flex gap-6 group hover:border-emerald-500/50 transition-all">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0 border border-emerald-500/20">
              <span className="text-emerald-400 font-bold">0{f.id}</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <h4 className="text-lg font-bold text-white">{f.title}</h4>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-slate-400 border border-white/10">Source: {f.source}</span>
                  <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-emerald-400 border border-white/10">Col: {f.column}</span>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{f.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const RadioLossAnalysis = ({ stats }: { stats: DashboardStats }) => {
  const events = stats.stationDeepAnalysis.criticalEvents.filter(e => e.type === 'Radio Loss');
  
  // Sort events by time
  const sortedEvents = [...events].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6 rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/20 rounded-xl">
                <Activity className="w-5 h-5 text-rose-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Radio Loss Timeline</h3>
            </div>
          </div>
          
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedEvents} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tick={{ fill: '#94a3b8' }}
                  angle={-45}
                  textAnchor="end"
                  interval={Math.ceil(sortedEvents.length / 15)}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tick={{ fill: '#94a3b8' }}
                  label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#f43f5e' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#0f172a] border border-white/10 p-3 rounded-xl shadow-2xl">
                          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">{data.time}</p>
                          <p className="text-white font-bold mb-1">Loco: {data.locoId}</p>
                          <p className="text-rose-400 font-bold mb-1">Duration: {data.duration}s</p>
                          {data.stationName && (
                            <p className="text-slate-300 text-xs">
                              Station: {formatStationName(data.stationName)}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="duration" fill="#f43f5e" radius={[4, 4, 0, 0]}>
                  {sortedEvents.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.duration > 60 ? '#f43f5e' : '#fb7185'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/5">
          <h3 className="text-lg font-bold text-white mb-4">Radio Loss Summary</h3>
          <div className="space-y-4">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Total Events</p>
              <p className="text-3xl font-bold text-white">{events.length}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Avg Duration</p>
              <p className="text-3xl font-bold text-white">
                {events.length > 0 ? Math.round(events.reduce((acc, e) => acc + e.duration, 0) / events.length) : 0}s
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Max Duration</p>
              <p className="text-3xl font-bold text-rose-400">
                {events.length > 0 ? Math.max(...events.map(e => e.duration)) : 0}s
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl border border-white/5">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">Detailed Event Log</h3>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded-full border border-rose-500/20">
              CRITICAL LOSS
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loco ID</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Station</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duration</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Radio</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedEvents.map((event, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-sm font-medium text-slate-300">{event.time}</td>
                  <td className="p-4 text-sm font-bold text-white">{event.locoId}</td>
                  <td className="p-4 text-sm text-slate-300">
                    {(() => {
                      const name = event.stationName && event.stationName !== 'N/A' && event.stationName !== '-' ? String(event.stationName) : '';
                      const id = event.stationId && event.stationId !== 'N/A' && event.stationId !== '-' ? formatStationName(event.stationId) : '';
                      
                      if (name && id) {
                        return `${formatStationName(name)} (${id})`;
                      }
                      if (name) {
                        return formatStationName(name);
                      }
                      if (id) {
                        return formatStationName(id);
                      }
                      return 'Unknown Station';
                    })()}
                  </td>
                  <td className="p-4">
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-xs font-bold",
                      event.duration > 60 ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                    )}>
                      {event.duration}s
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20">
                      {event.radio || 'Radio 1'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      event.reason?.includes('Hardware') ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                      event.reason?.includes('Software') ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                      "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    )}>
                      {event.reason || 'N/A'}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-400">{event.description}</td>
                </tr>
              ))}
              {sortedEvents.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500 italic">
                    No radio loss events detected in the current selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const MovingAnalysis = ({ stats }: { stats: DashboardStats }) => {
  const data = stats.movingRadioLoss || [];

  return (
    <div className="space-y-6">
      <div className="glass-card p-8 rounded-3xl border border-white/5 bg-gradient-to-br from-emerald-500/5 to-transparent">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-emerald-500/20 rounded-2xl">
            <Zap className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Moving Radio Loss Analysis</h2>
            <p className="text-slate-400 text-sm">Analysis of signal drops while locomotive is in motion (Speed &gt; 0)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Avg Moving Gaps</p>
            <p className="text-4xl font-bold text-white">
              {data.length > 0 ? (data.reduce((acc, d) => acc + d.movingGaps, 0) / data.length).toFixed(1) : 0}
            </p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Max Gap Recorded</p>
            <p className="text-4xl font-bold text-rose-400">
              {data.length > 0 ? Math.max(...data.map(d => d.maxGap)) : 0}s
            </p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Hardware Health</p>
            <p className="text-4xl font-bold text-emerald-400">
              {data.filter(d => !d.conclusion.includes('हार्डवेयर')).length} / {data.length} Healthy
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Loco ID</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Moving Gaps</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Max Gap (s)</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">R1 Usage</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">R2 Usage</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Conclusion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 font-bold text-white">{row.locoId}</td>
                  <td className="p-4">
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-xs font-bold",
                      row.movingGaps > 20 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
                    )}>
                      {row.movingGaps} times
                    </span>
                  </td>
                  <td className="p-4 text-slate-300 font-mono">{row.maxGap.toLocaleString()}s</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${row.r1Usage}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{row.r1Usage}%</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500" style={{ width: `${row.r2Usage}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{row.r2Usage}%</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={cn(
                      "text-xs font-medium px-3 py-1 rounded-full border",
                      row.conclusion.includes('सबसे अधिक') || row.conclusion.includes('हार्डवेयर') 
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    )}>
                      {row.conclusion}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 rounded-3xl border border-white/5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" /> Key Observations
          </h3>
          <ul className="space-y-3">
            <li className="flex gap-3 text-sm text-slate-300">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Actual Radio Loss (Moving Loss):</strong> Even after removing the 'Band' (stationary) state, many locos still have significant radio gaps.</span>
            </li>
            <li className="flex gap-3 text-sm text-slate-300">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Radio Balance (Hardware Health):</strong> The imbalance between Radio 1 and Radio 2 indicates hardware malfunction or antenna alignment issues.</span>
            </li>
          </ul>
        </div>
        <div className="glass-card p-6 rounded-3xl border border-white/5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Recommendations
          </h3>
          <ul className="space-y-3">
            <li className="flex gap-3 text-sm text-slate-300">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Immediately inspect the radio units and antennas of locos with hardware issues.</span>
            </li>
            <li className="flex gap-3 text-sm text-slate-300">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Map 'No Network Zones' in sections with large communication gaps.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

function FileDrop({ zone, label, onUpload, file, files, multiple }: { zone: string; label: string; onUpload: any; file?: File | null; files?: File[]; multiple?: boolean }) {
  const hasFiles = multiple ? (files && files.length > 0) : !!file;
  
  return (
    <div className={cn(
      "relative group cursor-pointer rounded-xl border-2 border-dashed transition-all p-4 text-center",
      hasFiles ? "bg-emerald-500/10 border-emerald-500/50" : "bg-white/5 border-white/10 hover:border-emerald-500/30"
    )}>
      <input
        type="file"
        multiple={multiple}
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => e.target.files && onUpload(zone, multiple ? e.target.files : e.target.files[0])}
      />
      <div className="flex flex-col items-center gap-2">
        {hasFiles ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        ) : (
          <Upload className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition-colors" />
        )}
        <span className={cn("text-xs font-medium", hasFiles ? "text-emerald-400" : "text-slate-400")}>
          {multiple 
            ? (files && files.length > 0 ? `${files.length} files selected` : label)
            : (file ? file.name : label)
          }
        </span>
      </div>
    </div>
  );
}
