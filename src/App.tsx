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
  ArrowRight,
  Zap,
  MapPin,
  Download,
  FileText,
  LogOut,
  LogIn,
  History,
  Trash2,
  Calendar,
  FileSearch,
  ChevronRight,
  ChevronDown,
  Flag,
  MessageSquare
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
  AreaChart,
  Area
} from 'recharts';
import { parseFile, processDashboardData } from './utils/dataProcessor';
import { DashboardStats } from './types';
import { cn } from './utils/cn';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  auth, 
  signIn, 
  signOut, 
  onAuthStateChanged, 
  User, 
  db, 
  collection, 
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDocFromServer,
  updateDoc,
  deleteDoc
} from './firebase';
import { format } from 'date-fns';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [files, setFiles] = useState<{ rf: File | null; trn: File | null; radio: File | null }>({
    rf: null,
    trn: null,
    radio: null,
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [tagSearch, setTagSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedStation, setSelectedStation] = useState<string>('All');
  const [selectedLoco, setSelectedLoco] = useState<string>('All');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await signIn();
    } catch (error: any) {
      console.error("Login Error:", error);
      setLoginError(error.message || "Failed to login. Please ensure popups are allowed or try opening the app in a new tab.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Test connection to Firestore
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  const handleFileUpload = async (type: keyof typeof files, file: File) => {
    setFiles((prev) => ({ ...prev, [type]: file }));
  };

  const saveAnalysisToHistory = async (processedStats: DashboardStats) => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const timestamp = new Date().toISOString();
      
      // Save main report
      await addDoc(collection(db, 'reports'), {
        locoId: processedStats.locoId,
        date: timestamp,
        overallPerformance: processedStats.locoPerformance,
        nmsFailRate: processedStats.nmsFailRate,
        avgLag: processedStats.avgLag,
        badStations: processedStats.badStns,
        userId: user.uid,
        notes: "",
        status: "Pending",
        isFlagged: false
      });

      // Save station history for bad stations
      const stationHistoryPromises = processedStats.stationStats
        .filter(s => s.percentage < 95)
        .map(s => addDoc(collection(db, 'station_history'), {
          stationId: s.stationId,
          date: timestamp,
          locoId: s.locoId,
          percentage: s.percentage,
          received: s.received,
          expected: s.expected,
          userId: user.uid
        }));

      await Promise.all(stationHistoryPromises);
      console.log("Analysis saved to history successfully.");
    } catch (error) {
      console.error("Error saving analysis to history:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const analyzeData = async () => {
    const fileCount = [files.rf, files.trn, files.radio].filter(f => f !== null).length;
    if (fileCount < 2) return;
    
    const rf = files.rf ? await parseFile(files.rf) : [];
    const trn = files.trn ? await parseFile(files.trn) : null;
    const radio = files.radio ? await parseFile(files.radio) : [];
    const processed = processDashboardData(rf, trn, radio);
    setStats(processed);
    setSelectedStation('All');
    setSelectedLoco('All');

    if (user) {
      saveAnalysisToHistory(processed);
    }
  };

  const getFilteredStats = (): DashboardStats | null => {
    if (!stats) return null;
    
    let filtered = { ...stats };

    if (selectedLoco !== 'All') {
      filtered.stationStats = filtered.stationStats.filter(s => String(s.locoId) === selectedLoco);
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

      // Recalculate loco performance for the specific loco
      if (filtered.stationStats.length > 0) {
        filtered.locoPerformance = filtered.stationStats.reduce((acc, s) => acc + s.percentage, 0) / filtered.stationStats.length;
        filtered.badStns = filtered.stationStats.filter(s => s.percentage < 95).map(s => s.stationId);
        filtered.goodStns = filtered.stationStats.filter(s => s.percentage >= 95).map(s => s.stationId);
      }

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
        filtered.nmsFailRate = (filtered.nmsLogs.filter(n => n.health !== '32').length / filtered.nmsLogs.length) * 100;
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
      
      // Recalculate loco performance for the specific station
      if (filtered.stationStats.length > 0) {
        filtered.locoPerformance = filtered.stationStats.reduce((acc, s) => acc + s.percentage, 0) / filtered.stationStats.length;
      }
    }

    return filtered;
  };

  const filteredStats = getFilteredStats();
  const uniqueStations = stats 
    ? ['All', ...new Set(stats.stationStats
        .filter(s => selectedLoco === 'All' || String(s.locoId) === selectedLoco)
        .map(s => String(s.stationId)))] 
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
        doc.text(`Filtered Station: ${selectedStation}`, 20, 59);
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
        
        const tagRows = filteredStats.tagLinkIssues.map(t => [t.time, t.stationId, t.error, t.info]);
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

      // Signature
      const pageCount = doc.getNumberOfPages();
      doc.setPage(pageCount);
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('__________________________', 140, 270);
      doc.text('Authorized Signature', 140, 277);
      doc.text('Kavach Technical Team', 140, 284);

      doc.save(`Kavach_Report_Loco_${filteredStats.locoId}${selectedStation !== 'All' ? '_Stn_' + selectedStation : ''}.pdf`);
    } catch (error) {
      console.error("PDF Generation Error:", error);
      alert("Report generate karne mein samasya aayi hai. Kripya console check karein.");
    }
  };

  const generateFailureLetter = () => {
    const filteredStats = getFilteredStats();
    if (!filteredStats) return;

    if (selectedLoco === 'All') {
      alert("Kripya ek specific Loco ID select karein failure analysis letter ke liye.");
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
      doc.text(`Subject: Deep Analysis & Failure Validation - Locomotive ${filteredStats.locoId}`, 20, 80);
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
      bodyY = writeText(`This letter provides a comprehensive technical audit of Locomotive ${filteredStats.locoId} based on real-time diagnostic logs. The analysis evaluates whether the reported system failure is technically justified (Genuine) or based on environmental/external factors (Flimsy).`, bodyY + 5);

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
        .map(s => [s.stationId, s.direction, `${s.received}/${s.expected}`, `${s.percentage.toFixed(1)}%`]);

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
          head: [['Timestamp', 'From', 'To', 'Reason', 'LP Response']],
          body: filteredStats.modeDegradations.map(d => [d.time, d.from, d.to, d.reason, d.lpResponse]),
          theme: 'grid',
          styles: { fontSize: 7 },
          margin: { left: 20 }
        });
        bodyY = (doc as any).lastAutoTable.finalY + 8;
      }

      // 4. Chronological Event Log (Last 5 Critical Events)
      const events = [
        ...filteredStats.modeDegradations.map(e => ({ time: e.time, type: 'DEGRADATION', detail: `${e.from} -> ${e.to} (${e.reason})` })),
        ...filteredStats.sosEvents.map(e => ({ time: e.time, type: 'SOS', detail: `${e.type} from ${e.source}` })),
        ...filteredStats.brakeApplications.map(e => ({ time: e.time, type: 'BRAKE', detail: `${e.type} at ${e.speed} km/h` }))
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
            return `Stn ${s.stationId} (Locos: ${ids})`;
          }).join('; ');
          
          const detailedStnList = filteredStats.multiLocoBadStns.map(s => {
            const details = s.locoDetails.map(d => `${d.id}: ${d.perf.toFixed(1)}% [${d.startTime} - ${d.endTime}]`).join(', ');
            return `Stn ${s.stationId} (Locos: ${details})`;
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
            return `Stn ${s.stationId} (Locos: ${ids})`;
          }).join('; ');
          
          const detailedStnList = filteredStats.multiLocoBadStns.map(s => {
            const details = s.locoDetails.map(d => `${d.id}: ${d.perf.toFixed(1)}% [${d.startTime} - ${d.endTime}]`).join(', ');
            return `Stn ${s.stationId} (Locos: ${details})`;
          }).join('; ');
          
          reasoning += `LOGICAL PROOF: The failure is marked as FLIMSY/WRONG. The performance drops are observed at [${conciseStnList}] across multiple locomotives. Since multiple locos are failing at the same spot, the fault lies with the Station TCAS equipment. The locomotive unit under analysis is performing normally elsewhere. \n\nDetailed Performance Audit: [${detailedStnList}]. `;
        } else if (hasInternalFault && !hasExternalSymptom) {
          reasoning += `Although NMS health is reported as sub-optimal (${filteredStats.nmsFailRate.toFixed(1)}% non-32 codes), the RFCOMM performance is stable at ${filteredStats.locoPerformance.toFixed(2)}% with 0 Tag issues. This indicates that the NMS codes are 'Transient' or 'Informational' and do not constitute a functional failure. `;
        } else if (filteredStats.badStns.length > 0 && filteredStats.badStns.length <= 2) {
          reasoning += `The performance drops are highly localized to Stn ${filteredStats.badStns.join(', ')}, proving that the issue is Track-side (RFID/Signal) and the Locomotive unit is healthy. `;
        }
        reasoning += `The locomotive is technically fit for operation.`;
      }
      bodyY = writeText(reasoning, bodyY + 2);

      // Recommendation
      bodyY = writeText(`7. RECOMMENDATION:`, bodyY + 8, 11, true);
      let recommendation = "";
      if (isGenuine) {
        if (filteredStats.multiLocoBadStns.length > 0) {
          const stnIds = filteredStats.multiLocoBadStns.map(s => s.stationId).join(', ');
          recommendation = `1. URGENT: Inspect Station TCAS/Kavach equipment at Stations [${stnIds}] as multiple locomotives are failing there. 2. Perform a technical audit of the Loco Processing Unit (CPU) and Power Supply Module.`;
        } else if (filteredStats.nmsFailRate > 50 && filteredStats.badStns.length === 1) {
          recommendation = `1. Inspect Station Kavach equipment at Stn ${filteredStats.badStns[0]} for CPU/Radio faults. 2. If the problem persists across other stations, replace the Loco Processing Unit (CPU) and check the Power Supply Module.`;
        } else {
          recommendation = `Immediate inspection of the Kavach antenna, RF cables, and NMS processing unit is required at the shed. The locomotive should be grounded for a full technical audit and recalibration.`;
        }
      } else {
        if (filteredStats.multiLocoBadStns.length > 0) {
          const stnIds = filteredStats.multiLocoBadStns.map(s => s.stationId).join(', ');
          recommendation = `The locomotive is fit for service. The reported communication drops are due to faulty Station-side equipment at [${stnIds}]. URGENT track-side audit is required at these locations.`;
        } else {
          recommendation = `The locomotive is fit for service. No hardware replacement is required. It is recommended to audit the track-side Kavach equipment and signal strength at stations [${filteredStats.badStns.join(', ')}] to resolve the localized communication drops.`;
        }
      }
      bodyY = writeText(recommendation, bodyY + 2);

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
      alert("Letter generate karne mein samasya aayi hai.");
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

        {/* User Profile */}
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
          {!user ? (
            <div className="space-y-2">
              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className={cn(
                  "w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all",
                  isLoggingIn && "opacity-50 cursor-not-allowed"
                )}
              >
                {isLoggingIn ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn className="w-3 h-3" />
                )}
                {isLoggingIn ? "Logging in..." : "Login to Save History"}
              </button>
              {loginError && (
                <p className="text-[10px] text-rose-400 font-medium leading-tight">{loginError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-emerald-500/30" />
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full py-1.5 bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 transition-all border border-white/5 hover:border-rose-500/20"
              >
                <LogOut className="w-3 h-3" /> Logout
              </button>
            </div>
          )}
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

        {/* User Profile / Login */}
        <div className="p-4 glass-card rounded-xl border border-white/5">
          {isAuthReady ? (
            user ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || ''} className="w-10 h-10 rounded-full border border-emerald-500/30" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                      {user.displayName?.charAt(0) || 'U'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{user.displayName}</p>
                    <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-rose-400 transition-all border border-white/5 hover:border-rose-500/30 rounded-lg"
                >
                  <LogOut className="w-3 h-3" /> Logout
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Cloud Storage</p>
                <p className="text-xs text-slate-300">Login to save analysis history and track station performance over time.</p>
                <button 
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className={cn(
                    "w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition-all text-xs font-bold flex items-center justify-center gap-2",
                    isLoggingIn && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isLoggingIn ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <LogIn className="w-3 h-3 text-emerald-400" />
                  )}
                  {isLoggingIn ? "Logging in..." : "Login with Google"}
                </button>
                {loginError && (
                  <p className="text-[10px] text-rose-400 font-medium leading-tight">{loginError}</p>
                )}
              </div>
            )
          ) : (
            <div className="h-20 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Data Input Center</h3>
            <div className="space-y-3">
              <FileDrop zone="rf" label="1. RFCOMM (Comm Health)" onUpload={handleFileUpload} file={files.rf} />
              <FileDrop zone="trn" label="2. TRNMSNMA (Software)" onUpload={handleFileUpload} file={files.trn} />
              <FileDrop zone="radio" label="3. RADIO_1 (Optional)" onUpload={handleFileUpload} file={files.radio} />
            </div>
          </div>

          <button
            onClick={analyzeData}
            disabled={[files.rf, files.trn, files.radio].filter(f => f !== null).length < 2}
            className={cn(
              "w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
              [files.rf, files.trn, files.radio].filter(f => f !== null).length >= 2 
                ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20" 
                : "bg-white/5 text-slate-500 cursor-not-allowed border border-white/5"
            )}
          >
            <Zap className="w-4 h-4" />
            Analyze Logs
          </button>
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
                <div className="flex gap-1 p-1 glass-card rounded-xl overflow-x-auto max-w-4xl">
                  <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} label="Summary" />
                  <TabButton active={activeTab === 'mapping'} onClick={() => setActiveTab('mapping')} label="Mapping" />
                  <TabButton active={activeTab === 'station'} onClick={() => setActiveTab('station')} label="Station Analysis" />
                  <TabButton active={activeTab === 'expert'} onClick={() => setActiveTab('expert')} label="Expert Diagnostics" />
                  <TabButton active={activeTab === 'nms'} onClick={() => setActiveTab('nms')} label="NMS" />
                  <TabButton active={activeTab === 'sync'} onClick={() => setActiveTab('sync')} label="Sync" />
                  <TabButton active={activeTab === 'interval'} onClick={() => setActiveTab('interval')} label="Interval" />
                  <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} label="History" />
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-4 p-4 glass-card rounded-2xl border border-white/5">
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> Filter by Station
                  </label>
                  <select 
                    value={selectedStation}
                    onChange={(e) => setSelectedStation(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  >
                    {uniqueStations.map(stn => (
                      <option key={stn} value={stn} className="bg-slate-900">{stn}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="w-3 h-3" /> Filter by Loco
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
                { (selectedStation !== 'All' || selectedLoco !== 'All') && (
                  <div className="flex items-end">
                    <button 
                      onClick={() => { setSelectedStation('All'); setSelectedLoco('All'); }}
                      className="px-4 py-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/20 text-xs font-bold hover:bg-rose-500/30 transition-all"
                    >
                      Reset Filters
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
            {activeTab === 'history' && (
              <HistoryView 
                user={user} 
                handleLogin={handleLogin} 
                isLoggingIn={isLoggingIn} 
                loginError={loginError} 
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StationAnalysis({ stats }: { stats: DashboardStats }) {
  // Group stats by station for the table but keep individual for the chart if needed
  // Or better, prepare a chart-friendly data structure
  const chartData = stats.stationStats.reduce((acc: any[], curr) => {
    const existing = acc.find(a => a.stationId === curr.stationId);
    const suffix = curr.direction.toLowerCase().includes('nominal') ? 'Nominal' : 
                   curr.direction.toLowerCase().includes('reverse') ? 'Reverse' : curr.direction;
    
    if (existing) {
      existing[`perc_${suffix}`] = curr.percentage;
      existing[`received_${suffix}`] = curr.received;
      existing[`expected_${suffix}`] = curr.expected;
    } else {
      acc.push({
        stationId: curr.stationId,
        [`perc_${suffix}`]: curr.percentage,
        [`received_${suffix}`]: curr.received,
        [`expected_${suffix}`]: curr.expected
      });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <div className="glass-card p-8 rounded-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-400" />
            Station-wise RFCOMM Performance (Nominal vs Reverse)
          </h3>
          <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded" /> Healthy ({'>'}= 95%)</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-rose-500 rounded" /> Critical ({'<'} 95%)</div>
          </div>
        </div>
        
        <div className="h-[500px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={stats.stationStats.map(s => ({ ...s, label: `${s.stationId} (${s.direction})` }))} 
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
                formatter={(value: number, name: string, props: any) => [
                  `${value.toFixed(2)}%`, 
                  `Success (${props.payload.direction})`
                ]}
              />
              <Bar dataKey="percentage" radius={[4, 4, 0, 0]} barSize={30}>
                {stats.stationStats.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.percentage < 95 ? '#ef4444' : '#10b981'} 
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Detailed RFCOMM Log Mapping</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500 uppercase text-[10px] font-bold border-b border-white/5">
              <tr>
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
                  <td className="py-3 px-4 font-mono text-emerald-400">{s.locoId}</td>
                  <td className="py-3 px-4 font-bold text-white">{s.stationId}</td>
                  <td className="py-3 px-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      s.direction.toLowerCase().includes('nominal') ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                    )}>
                      {s.direction}
                    </span>
                  </td>
                  <td className="py-3 px-4">{s.expected}</td>
                  <td className="py-3 px-4">{s.received}</td>
                  <td className="py-3 px-4">
                    <span className={cn(
                      "font-bold",
                      s.percentage >= 95 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {s.percentage.toFixed(2)}%
                    </span>
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
    t.info.toLowerCase().includes(tagSearch.toLowerCase()) || 
    t.error.toLowerCase().includes(tagSearch.toLowerCase()) ||
    t.stationId.toLowerCase().includes(tagSearch.toLowerCase())
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
                  <td className="py-3 px-4"><span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">{d.from}</span></td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded text-[10px] font-bold">{d.to}</span></td>
                  <td className="py-3 px-4">{d.reason}</td>
                  <td className="py-3 px-4 italic text-slate-400">{d.lpResponse}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">No mode degradation events detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                      <span>Station: {item.stationId}</span>
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
                  <td className="py-3 px-4 font-bold text-white">{t.stationId}</td>
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
              <p className="text-xs text-slate-500 mt-2">Percentage of logs where NMS Health was not 32.</p>
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
      <div className="col-span-2 space-y-6">
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
              { label: "Station Hardware", status: stats.badStns.length > 0 ? "Marginal" : "Healthy", reason: stats.badStns.length > 0 ? `Significant drops detected at ${stats.badStns.join(', ')}.` : "All stations performing optimally." }
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

      <div className="space-y-6">
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

function DeepMapping({ stats, files }: { stats: DashboardStats; files: { rf: File | null; trn: File | null; radio: File | null } }) {
  const failures = [
    {
      id: 1,
      title: `NMS Health Critical Failure (${stats.nmsFailRate.toFixed(1)}%)`,
      source: files.trn?.name || 'N/A',
      column: "'NMS Health'",
      detail: `The NMS Health column should ideally maintain a value of 32 (Healthy). Your data contains anomalous values in ${stats.nmsFailRate.toFixed(1)}% of rows, indicating persistent NMS server connection issues.`
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
      source: files.rf?.name || 'N/A',
      column: "'Station Id' and 'Percentage'",
      detail: `Average percentage analysis indicates that signal strength at stations ${stats.badStns.join(', ') || 'None'} has fallen below the 95% threshold.`
    },
    {
      id: 4,
      title: "Sync Loss / Refresh Lag Analysis",
      source: files.radio?.name || 'N/A',
      column: "'Time'",
      detail: `The average interval between MA packets was recorded at ${stats.avgLag.toFixed(2)} seconds. Any deviation from the RDSO standard (1.0s) triggers a session drop by the Loco system.`
    }
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

function HistoryView({ 
  user, 
  handleLogin, 
  isLoggingIn, 
  loginError 
}: { 
  user: User | null; 
  handleLogin: () => Promise<void>; 
  isLoggingIn: boolean; 
  loginError: string | null; 
}) {
  const [reports, setReports] = useState<any[]>([]);
  const [stationHistory, setStationHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'reports' | 'stations'>('reports');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState("");

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const reportsQuery = query(
        collection(db, 'reports'),
        where('userId', '==', user.uid),
        orderBy('date', 'desc'),
        limit(50)
      );
      const reportsSnapshot = await getDocs(reportsQuery);
      setReports(reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const stationQuery = query(
        collection(db, 'station_history'),
        where('userId', '==', user.uid),
        orderBy('date', 'desc'),
        limit(100)
      );
      const stationSnapshot = await getDocs(stationQuery);
      setStationHistory(stationSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const toggleFlag = async (reportId: string, currentFlag: boolean) => {
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { isFlagged: !currentFlag });
      setReports(reports.map(r => r.id === reportId ? { ...r, isFlagged: !currentFlag } : r));
    } catch (error) {
      console.error("Error toggling flag:", error);
    }
  };

  const toggleStatus = async (reportId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Pending' ? 'Resolved' : 'Pending';
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { status: nextStatus });
      setReports(reports.map(r => r.id === reportId ? { ...r, status: nextStatus } : r));
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  const saveNotes = async (reportId: string) => {
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { notes: tempNotes });
      setReports(reports.map(r => r.id === reportId ? { ...r, notes: tempNotes } : r));
      setEditingNotes(null);
    } catch (error) {
      console.error("Error saving notes:", error);
    }
  };

  const deleteReport = async (reportId: string) => {
    if (!window.confirm("Are you sure you want to delete this report? This action cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, 'reports', reportId));
      setReports(reports.filter(r => r.id !== reportId));
    } catch (error) {
      console.error("Error deleting report:", error);
    }
  };

  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
          <History className="w-8 h-8 text-slate-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">Login Required</h3>
          <p className="text-slate-400 max-w-sm">Please login with your Google account to view and save analysis history.</p>
        </div>
        <button 
          onClick={handleLogin}
          disabled={isLoggingIn}
          className={cn(
            "px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2",
            isLoggingIn && "opacity-50 cursor-not-allowed"
          )}
        >
          {isLoggingIn ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <LogIn className="w-4 h-4" />
          )}
          {isLoggingIn ? "Logging in..." : "Login with Google"}
        </button>
        {loginError && (
          <p className="text-sm text-rose-400 font-medium max-w-sm">{loginError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
          <button 
            onClick={() => setView('reports')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all",
              view === 'reports' ? "bg-emerald-500 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
            Analysis Reports
          </button>
          <button 
            onClick={() => setView('stations')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all",
              view === 'stations' ? "bg-emerald-500 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
            Station Failures
          </button>
        </div>
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
          Showing last {view === 'reports' ? reports.length : stationHistory.length} records
        </p>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        </div>
      ) : view === 'reports' ? (
        <div className="grid gap-4">
          {reports.length > 0 ? reports.map((report) => (
            <div key={report.id} className={cn(
              "glass-card p-6 rounded-2xl border transition-all group relative",
              report.isFlagged ? "border-amber-500/50 bg-amber-500/5 shadow-lg shadow-amber-500/10" : "border-white/5 hover:border-emerald-500/30"
            )}>
              <div className="flex justify-between items-start">
                <div className="flex gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center border",
                    report.isFlagged ? "bg-amber-500/20 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/20"
                  )}>
                    <FileSearch className={cn("w-6 h-6", report.isFlagged ? "text-amber-400" : "text-emerald-400")} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-bold text-white">Loco {report.locoId}</h4>
                      {report.isFlagged && (
                        <span className="px-2 py-0.5 bg-amber-500 text-black text-[10px] font-black rounded uppercase tracking-tighter">Watchlist</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                      <Calendar className="w-3 h-3" /> {format(new Date(report.date), 'PPP p')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Performance</p>
                    <p className={cn(
                      "text-2xl font-bold",
                      report.overallPerformance >= 98 ? "text-emerald-400" : "text-amber-400"
                    )}>
                      {report.overallPerformance.toFixed(1)}%
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => toggleFlag(report.id, report.isFlagged)}
                      className={cn(
                        "p-2 rounded-lg border transition-all",
                        report.isFlagged ? "bg-amber-500 text-black border-amber-500" : "bg-white/5 border-white/10 text-slate-500 hover:text-amber-400"
                      )}
                      title={report.isFlagged ? "Remove from Watchlist" : "Add to Watchlist"}
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => deleteReport(report.id)}
                      className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title="Delete Report"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-4 gap-4 pt-4 border-t border-white/5">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">NMS Fail Rate</p>
                  <p className="text-sm font-bold text-white">{report.nmsFailRate.toFixed(1)}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Avg Lag</p>
                  <p className="text-sm font-bold text-white">{report.avgLag.toFixed(2)}s</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Status</p>
                  <button 
                    onClick={() => toggleStatus(report.id, report.status || 'Pending')}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all",
                      report.status === 'Resolved' ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                    )}
                  >
                    {report.status === 'Resolved' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {report.status || 'Pending'}
                  </button>
                </div>
                <div className="flex items-end justify-end">
                  <button className="text-emerald-400 hover:text-emerald-300 text-xs font-bold flex items-center gap-1 transition-colors">
                    View Details <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-2">
                    <MessageSquare className="w-3 h-3" /> Technician Notes
                  </p>
                  {editingNotes !== report.id ? (
                    <button 
                      onClick={() => { setEditingNotes(report.id); setTempNotes(report.notes || ""); }}
                      className="text-[10px] text-emerald-400 hover:underline font-bold"
                    >
                      {report.notes ? 'Edit' : 'Add Note'}
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => saveNotes(report.id)} className="text-[10px] text-emerald-400 font-bold">Save</button>
                      <button onClick={() => setEditingNotes(null)} className="text-[10px] text-slate-500 font-bold">Cancel</button>
                    </div>
                  )}
                </div>
                {editingNotes === report.id ? (
                  <textarea 
                    value={tempNotes}
                    onChange={(e) => setTempNotes(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500/50 min-h-[60px]"
                    placeholder="Enter maintenance notes..."
                  />
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    {report.notes || "No notes added yet."}
                  </p>
                )}
              </div>
            </div>
          )) : (
            <div className="py-20 text-center glass-card rounded-2xl border border-white/5">
              <p className="text-slate-500">No analysis reports found.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-500 uppercase text-[10px] font-bold border-b border-white/5">
              <tr>
                <th className="py-4 px-6">Date</th>
                <th className="py-4 px-6">Station</th>
                <th className="py-4 px-6">Loco ID</th>
                <th className="py-4 px-6">Performance</th>
                <th className="py-4 px-6">Status</th>
              </tr>
            </thead>
            <tbody className="text-slate-300 divide-y divide-white/5">
              {stationHistory.length > 0 ? stationHistory.map((entry) => (
                <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-4 px-6 text-xs text-slate-500">{format(new Date(entry.date), 'MMM d, yyyy')}</td>
                  <td className="py-4 px-6 font-bold text-white">{entry.stationName}</td>
                  <td className="py-4 px-6 font-mono text-xs">{entry.locoId}</td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden w-24">
                        <div 
                          className={cn(
                            "h-full rounded-full",
                            entry.performance < 90 ? "bg-rose-500" : "bg-amber-500"
                          )}
                          style={{ width: `${entry.performance}%` }}
                        />
                      </div>
                      <span className="font-bold">{entry.performance.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      entry.performance < 90 ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                    )}>
                      {entry.performance < 90 ? 'Critical' : 'Marginal'}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="py-20 text-center text-slate-500">No station failure history found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FileDrop({ zone, label, onUpload, file }: { zone: string; label: string; onUpload: any; file: File | null }) {
  return (
    <div className={cn(
      "relative group cursor-pointer rounded-xl border-2 border-dashed transition-all p-4 text-center",
      file ? "bg-emerald-500/10 border-emerald-500/50" : "bg-white/5 border-white/10 hover:border-emerald-500/30"
    )}>
      <input
        type="file"
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => e.target.files?.[0] && onUpload(zone, e.target.files[0])}
      />
      <div className="flex flex-col items-center gap-2">
        {file ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        ) : (
          <Upload className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition-colors" />
        )}
        <span className={cn("text-xs font-medium", file ? "text-emerald-400" : "text-slate-400")}>
          {file ? file.name : label}
        </span>
      </div>
    </div>
  );
}
