import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { AppSettings, getSettings } from '../utils/settings';
import { fetchTimeout } from '../utils/fetchTimeout';

interface Asset {
  filename: string;
  pages: number;
}
interface PrintJobDetailItem {
  id: string;
  asset: Asset;
  price: number;
  status: string;
}
interface PrintJobDetail {
  id: string;
  customer_name: string;
  total_price: number;
  status: 'pending_payment' | 'pending' | 'processing' | 'completed' | 'failed';
  details: PrintJobDetailItem[];
}
interface ApiResponse {
  detail: PrintJobDetail;
}

interface ExtendedAppSettings extends AppSettings {
  enableQris?: boolean;
  qrisImageUrl?: string;
}

type PaymentMethod = 'none' | 'manual' | 'qris';
type FlowStep = 'scan' | 'selection' | 'waiting_payment';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [printJob, setPrintJob] = useState<PrintJobDetail | null>(null);

  const [flowStep, setFlowStep] = useState<FlowStep>('scan');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('none');

  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const [settings, setSettings] = useState<ExtendedAppSettings | null>(null);

  useEffect(() => {
    getSettings().then((s) => setSettings(s as ExtendedAppSettings));
  }, []);

  const startInactivityTimer = useCallback(() => {
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);

    setShowInactivityWarning(false);
    setCountdown(30);

    inactivityTimeoutRef.current = setTimeout(() => {
      if (!processing) setShowInactivityWarning(true);
    }, 45000);
  }, [processing]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showInactivityWarning) {
      interval = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showInactivityWarning]);

  useEffect(() => {
    if (showInactivityWarning && countdown <= 0) {
      handleClose();
    }
  }, [countdown, showInactivityWarning]);

  useEffect(() => {
    if (flowStep === 'scan') {
      startInactivityTimer();
    }
    return () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [startInactivityTimer, flowStep]);

  const handleUserActivity = () => {
    if (showInactivityWarning) {
      setShowInactivityWarning(false);
      startInactivityTimer();
    } else {
      startInactivityTimer();
    }
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  const handleDispatch = async (jobId: string) => {
    if (processing) return;
    setProcessing(true);
    stopPolling();

    try {
      const currentSettings = await getSettings();

      const dispatchUrl = `http://${currentSettings.baseUrl}/api/print-job/${jobId}/dispatch`;

      const dispatchResponse = await fetchTimeout(dispatchUrl, { timeout: 5000, method: 'POST' });

      if (!dispatchResponse.ok) {
        throw new Error('Gagal mengirimkan pekerjaan ke printer.');
      }

      router.replace('/(modal)/success');
    } catch (error: any) {
      console.error('Error during dispatch:', error);
      Alert.alert('Error', 'Terjadi kesalahan saat mencetak.');
      setProcessing(false);
    }
  };

  const checkPaymentStatus = useCallback(async () => {
    if (!printJob || !settings) return;

    try {
      const checkUrl = `http://${settings.baseUrl}/api/print-job/${printJob.id}`;
      const response = await fetch(checkUrl);
      const result: ApiResponse = await response.json();

      if (response.ok && result.detail) {
        setPrintJob(result.detail);

        if (result.detail.status === 'pending') {
          stopPolling();
          handleDispatch(result.detail.id);
        }
      }
    } catch (error) {
      console.log('Polling error:', error);
    }
  }, [printJob, settings]);

  useEffect(() => {
    if (flowStep === 'waiting_payment') {
      pollingIntervalRef.current = setInterval(checkPaymentStatus, 1000);
      setIsPolling(true);
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [flowStep, checkPaymentStatus]);

  const handleClose = () => {
    stopPolling();
    setPrintJob(null);
    setScanned(false);
    setFlowStep('scan');
    setSelectedMethod('none');
    setProcessing(false);
    startInactivityTimer();
    if (flowStep === 'scan') {
      router.back();
    }
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (isLoading || scanned) return;

    setScanned(true);
    setIsLoading(true);
    Vibration.vibrate();

    const currentSettings = await getSettings();
    if (!currentSettings.baseUrl) {
      Alert.alert('Printer Belum Diatur', 'Harap atur Base URL printer di halaman Pengaturan.', [
        { text: 'OK', onPress: handleClose },
      ]);
      return;
    }
    setSettings(currentSettings as ExtendedAppSettings);
    const url = `http://${currentSettings.baseUrl}/api/print-job/${data}`;

    try {
      const response = await fetchTimeout(url, { timeout: 5000, method: 'GET' });
      const result: ApiResponse = await response.json();

      if (!response.ok || !result.detail) {
        throw new Error('Gagal mengambil data pekerjaan cetak.');
      }

      const job = result.detail;

      if (job.status !== 'pending_payment') {
        if (job.status === 'pending') {
          setPrintJob(job);
          handleDispatch(job.id);
          return;
        }

        Alert.alert('Status Pekerjaan', `Status dokumen ini adalah: ${job.status}`, [
          { text: 'OK', onPress: handleClose },
        ]);
        return;
      }

      setPrintJob(job);
      setFlowStep('selection');
    } catch (error: any) {
      console.error('Failed to fetch print job', error);
      Alert.alert('Error', 'Terdapat kesalahan dalam sistem.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMethod = (method: PaymentMethod) => {
    if (method === 'qris') {
      if (!settings?.enableQris || !settings?.qrisImageUrl) {
        return;
      }
    }
    setSelectedMethod(method);
    setFlowStep('waiting_payment');
  };

  const handleManualRefresh = () => {
    checkPaymentStatus();
    Vibration.vibrate();
  };

  if (!permission) return <View className="flex-1 bg-white" />;
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Text>Izin Kamera Diperlukan</Text>
        <TouchableOpacity onPress={requestPermission} className="mt-4 rounded-full bg-blue-600 p-4">
          <Text className="text-white">Berikan Izin</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white" onTouchStart={handleUserActivity}>
      <StatusBar barStyle="dark-content" />
      <View className="absolute left-0 top-0 -ml-24 -mt-10 h-72 w-72 rounded-full bg-blue-100 opacity-40" />
      <View className="absolute bottom-0 right-0 -mb-10 -mr-24 h-80 w-80 rounded-full bg-blue-50 opacity-60" />

      {/* Header */}
      <View className="z-10 flex-row items-center justify-between px-6 pt-16">
        <TouchableOpacity
          onPress={handleClose}
          className="h-12 w-12 items-center justify-center rounded-full border border-slate-100 bg-white shadow-sm active:bg-slate-50">
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-extrabold tracking-tight text-slate-900">Scan QR Code</Text>
        <View className="h-12 w-12" />
      </View>

      {/* Scanner View */}
      <View className="z-10 flex-1 flex-col items-center justify-start pt-10">
        <View className="mb-8 px-8">
          <Text className="text-center text-lg font-medium text-slate-500">
            Arahkan kode QR dari WhatsApp ke kamera
          </Text>
        </View>
        <View className="relative">
          <View className="absolute -inset-1 rounded-[36px] bg-blue-100 opacity-50" />
          <View className="h-[400px] w-[320px] overflow-hidden rounded-[32px] border-8 border-white bg-slate-900 shadow-2xl shadow-blue-300">
            {!printJob && !scanned && (
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="front"
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              />
            )}
            <View className="absolute inset-0 items-center justify-center">
              <View className="h-64 w-64 items-center justify-center">
                <View className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-white/80" />
                <View className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-white/80" />
                <View className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-white/80" />
                <View className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-white/80" />
                {!scanned && (
                  <View className="h-48 w-48 animate-pulse rounded-lg border border-white/30 bg-white/10" />
                )}
              </View>
            </View>
            <View className="absolute bottom-6 w-full items-center">
              <View className="rounded-full bg-black/60 px-4 py-2 backdrop-blur-md">
                <Text className="text-xs font-bold uppercase tracking-widest text-white">
                  {isLoading ? 'Memproses...' : 'Mencari...'}
                </Text>
              </View>
            </View>
          </View>
        </View>
        {scanned && !printJob && !isLoading && (
          <TouchableOpacity
            onPress={() => {
              setScanned(false);
              setIsLoading(false);
            }}
            className="mt-8 flex-row items-center space-x-2 rounded-full bg-slate-900 px-6 py-3 shadow-lg active:scale-95">
            <Ionicons name="refresh" size={20} color="white" />
            <Text className="font-bold text-white">Pindai Ulang</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Inactivity Warning Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showInactivityWarning}
        onRequestClose={() => {}}>
        <View className="flex-1 items-center justify-center bg-slate-900/80 px-8 backdrop-blur-sm">
          <View className="w-full max-w-sm items-center rounded-3xl bg-white p-6 shadow-2xl">
            <View className="mb-4 h-16 w-16 animate-bounce items-center justify-center rounded-full bg-orange-100">
              <Ionicons name="time" size={32} color="#f97316" />
            </View>
            <Text className="mb-2 text-center text-xl font-extrabold text-slate-900">
              Masih di sana?
            </Text>
            <Text className="mb-8 font-mono text-5xl font-black tracking-widest text-slate-900">
              {countdown < 10 ? `0${countdown}` : countdown}
            </Text>
            <TouchableOpacity
              onPress={handleUserActivity}
              className="w-full rounded-xl bg-blue-600 py-4 shadow-blue-300">
              <Text className="text-center text-base font-bold text-white">Saya Masih Di Sini</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Payment & Confirmation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={!!printJob}
        onRequestClose={handleClose}>
        <View className="flex-1 bg-white">
          <StatusBar barStyle="dark-content" />

          {/* Modal Header */}
          <View className="z-10 flex-row items-center justify-between border-b border-slate-100 bg-white px-6 pb-4 pt-16">
            <View>
              <Text className="text-2xl font-extrabold text-slate-900">
                {flowStep === 'selection'
                  ? 'Pilih Pembayaran'
                  : flowStep === 'waiting_payment'
                    ? 'Menunggu Pembayaran'
                    : 'Detail Cetak'}
              </Text>
              <Text className="text-sm text-slate-500">
                Untuk: {printJob?.customer_name || 'Customer'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200">
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Modal Content */}
          <View className="flex-1 px-6 pt-6">
            {/* STEP 1: PAYMENT SELECTION */}
            {flowStep === 'selection' && (
              <View className="flex-1">
                <Text className="mb-4 text-lg font-bold text-slate-700">
                  Total Tagihan: {formatCurrency(printJob?.total_price || 0)}
                </Text>

                <View className="gap-y-4">
                  {/* Manual Payment Option */}
                  <TouchableOpacity
                    onPress={() => handleSelectMethod('manual')}
                    className="flex-row items-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm active:bg-slate-50">
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                      <Ionicons name="cash-outline" size={24} color="#2563eb" />
                    </View>
                    <View className="ml-4 flex-1">
                      <Text className="text-lg font-bold text-slate-900">Pembayaran Manual</Text>
                      <Text className="text-sm text-slate-500">Bayar di kasir secara tunai</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
                  </TouchableOpacity>

                  {/* QRIS Payment Option */}
                  <TouchableOpacity
                    onPress={() => handleSelectMethod('qris')}
                    disabled={!settings?.enableQris || !settings?.qrisImageUrl}
                    className={`flex-row items-center rounded-2xl border p-6 shadow-sm
                            ${
                              !settings?.enableQris || !settings?.qrisImageUrl
                                ? 'border-slate-100 bg-slate-50 opacity-60'
                                : 'border-slate-200 bg-white active:bg-slate-50'
                            }`}>
                    <View
                      className={`h-12 w-12 items-center justify-center rounded-full
                             ${!settings?.enableQris || !settings?.qrisImageUrl ? 'bg-slate-200' : 'bg-red-100'}`}>
                      <Ionicons
                        name="qr-code-outline"
                        size={24}
                        color={
                          !settings?.enableQris || !settings?.qrisImageUrl ? '#94a3b8' : '#dc2626'
                        }
                      />
                    </View>
                    <View className="ml-4 flex-1">
                      <Text className="text-lg font-bold text-slate-900">QRIS</Text>
                      <Text className="text-sm text-slate-500">
                        {!settings?.enableQris || !settings?.qrisImageUrl
                          ? 'Metode pembayaran ini sedang dalam perbaikan'
                          : 'Scan QRIS untuk membayar'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
                  </TouchableOpacity>
                </View>

                {/* Print Job Summary Preview */}
                <View className="mt-8 flex-1 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                  <View className="border-b border-slate-100 bg-slate-50 p-4">
                    <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      Ringkasan Dokumen
                    </Text>
                  </View>
                  <ScrollView className="flex-1 px-4">
                    <View className="gap-y-3 py-2">
                      {printJob?.details.map((file, index) => (
                        <View
                          key={file.id}
                          className={`flex-row justify-between ${index !== (printJob?.details.length ?? 0) - 1 ? 'border-b border-dashed border-slate-200 pb-3' : ''}`}>
                          {file?.asset ? (
                            <View>
                              <View className="mr-4 flex-1">
                                <Text
                                  numberOfLines={1}
                                  className="text-sm font-semibold text-slate-700">
                                  {file?.asset?.filename}
                                </Text>
                              </View>
                              <Text className="text-sm font-bold text-slate-900">
                                {file?.asset?.pages}
                              </Text>
                            </View>
                          ) : (
                            <View>
                              <View className="mr-4 flex-1">
                                <Text
                                  numberOfLines={1}
                                  className="text-sm font-semibold text-slate-700">
                                  {file?.asset?.filename || '(fitur dalam perbaikan)'}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}

            {/* STEP 2: WAITING FOR PAYMENT */}
            {flowStep === 'waiting_payment' && (
              <View className="flex-1 items-center pt-4">
                {/* QRIS Display or Manual Icon */}
                {selectedMethod === 'qris' && settings?.qrisImageUrl ? (
                  <View className="items-center">
                    <View className="overflow-hidden rounded-2xl border-2 border-slate-100 bg-white p-2 shadow-lg">
                      <Image
                        source={{ uri: settings.qrisImageUrl }}
                        style={{ width: 250, height: 250 }}
                        resizeMode="contain"
                      />
                    </View>
                    <Text className="mt-4 text-center text-sm font-medium text-slate-500">
                      Scan QRIS di atas untuk membayar
                    </Text>
                  </View>
                ) : (
                  <View className="items-center py-8">
                    <View className="mb-6 h-32 w-32 items-center justify-center rounded-full bg-blue-50">
                      <Ionicons name="storefront-outline" size={64} color="#2563eb" />
                    </View>
                    <Text className="text-center text-lg font-bold text-slate-900">
                      Silakan Lakukan Pembayaran
                    </Text>
                    <Text className="text-center text-slate-500">
                      Lakukan pembayaran tunai pada Admin RMD
                    </Text>
                  </View>
                )}

                {/* Total Price */}
                <View className="mt-8 rounded-xl bg-slate-50 px-8 py-4">
                  <Text className="text-center text-sm font-bold uppercase text-slate-400">
                    Total Bayar
                  </Text>
                  <Text className="text-center text-3xl font-black text-slate-900">
                    {formatCurrency(printJob?.total_price || 0)}
                  </Text>
                </View>

                {/* Status Indicator */}
                <View className="mt-auto w-full pb-8">
                  <View className="mb-6 flex-row items-center justify-center gap-x-2">
                    {processing ? (
                      <ActivityIndicator color="#2563eb" />
                    ) : (
                      <ActivityIndicator color="#94a3b8" />
                    )}
                    <Text className="font-medium text-slate-500">
                      {processing ? 'Memproses cetakan...' : 'Menunggu pembayaran...'}
                    </Text>
                  </View>

                  {/* Manual Check Button */}
                  {!processing && (
                    <TouchableOpacity
                      onPress={handleManualRefresh}
                      className="w-full items-center justify-center rounded-full border border-blue-200 bg-blue-50 py-4 active:bg-blue-100">
                      <Text className="font-bold text-blue-600">Cek Status Pembayaran</Text>
                    </TouchableOpacity>
                  )}

                  {/* Back to Selection */}
                  {!processing && (
                    <TouchableOpacity
                      onPress={() => {
                        setFlowStep('selection');
                        stopPolling();
                      }}
                      className="mt-4 w-full items-center justify-center rounded-full py-4">
                      <Text className="font-bold text-slate-400">Ganti Metode Pembayaran</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
