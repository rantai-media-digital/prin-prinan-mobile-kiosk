import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppSettings, getSettings, saveSettings } from '../../utils/settings';

// Extending the interface locally to support new fields if not present in utils
interface ExtendedAppSettings extends AppSettings {
  enableQris?: boolean;
  qrisImageUrl?: string;
}

const SettingsScreen = () => {
  const router = useRouter();
  const [settings, setSettings] = useState<ExtendedAppSettings | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const storedSettings = await getSettings();
      setSettings(storedSettings);
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    let settingsToSave = { ...settings };

    if (newPin) {
      if (newPin.length !== 4) {
        Alert.alert('Error', 'PIN harus 4 digit.');
        return;
      }
      if (newPin !== confirmNewPin) {
        Alert.alert('Error', 'PIN baru tidak cocok.');
        return;
      }
      settingsToSave.pin = newPin;
    }

    // Ensure numeric/boolean types where necessary or string trimming
    if (settingsToSave.qrisImageUrl) {
      settingsToSave.qrisImageUrl = settingsToSave.qrisImageUrl.trim();
    }

    await saveSettings(settingsToSave);
    Alert.alert('Tersimpan', 'Pengaturan berhasil disimpan.');
    router.back();
  };

  if (!settings) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" />
      <View className="z-10 flex-row items-center justify-between border-b border-slate-100 bg-white px-6 pb-4 pt-16">
        <View>
          <Text className="text-2xl font-extrabold text-slate-900">Pengaturan</Text>
          <Text className="text-sm text-slate-500">Konfigurasi Printer & Pembayaran</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200">
          <Ionicons name="close" size={24} color="#64748b" />
        </TouchableOpacity>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
        {/* Printer Configuration */}
        <View className="mb-8">
          <Text className="mb-2 text-base font-bold text-slate-700">Printer Base URL</Text>
          <TextInput
            value={settings.baseUrl}
            onChangeText={(text) => setSettings({ ...settings, baseUrl: text })}
            placeholder="contoh: 192.168.1.100:8080"
            className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-lg"
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text className="mt-2 text-xs text-slate-400">
            Alamat dan port server printer tanpa trailing slash. Contoh : http://172.0.0.1:8000, https://example.com
          </Text>
        </View>

        {/* QRIS Configuration */}
        <View className="mb-8 border-t border-slate-100 pt-6">
          <View className="mb-4 flex-row items-center justify-between">
            <View>
              <Text className="text-base font-bold text-slate-700">Aktifkan QRIS</Text>
              <Text className="text-xs text-slate-400">Izinkan pembayaran via QRIS</Text>
            </View>
            <Switch
              value={settings.enableQris ?? false}
              onValueChange={(val) => setSettings({ ...settings, enableQris: val })}
              trackColor={{ false: '#cbd5e1', true: '#2563eb' }}
              thumbColor={'#ffffff'}
            />
          </View>

          {settings.enableQris && (
            <View>
              <Text className="mb-2 text-base font-bold text-slate-700">URL Gambar QRIS</Text>
              <TextInput
                value={settings.qrisImageUrl ?? ''}
                onChangeText={(text) => setSettings({ ...settings, qrisImageUrl: text })}
                placeholder="https://example.com/qris.jpg"
                className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-lg"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Text className="mt-2 text-xs text-slate-400">
                Link langsung ke file gambar QR Code Statis.
              </Text>
            </View>
          )}
        </View>

        {/* PIN Configuration */}
        <View className="mb-8 border-t border-slate-100 pt-6">
          <Text className="mb-2 text-base font-bold text-slate-700">Ubah PIN</Text>
          <TextInput
            value={newPin}
            onChangeText={setNewPin}
            placeholder="PIN Baru (4 digit)"
            className="mb-4 rounded-xl border border-slate-300 bg-slate-50 p-4 text-lg"
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
          />
          <TextInput
            value={confirmNewPin}
            onChangeText={setConfirmNewPin}
            placeholder="Konfirmasi PIN Baru"
            className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-lg"
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
          />
          <Text className="mt-2 text-xs text-slate-400">
            Kosongkan jika tidak ingin mengubah PIN.
          </Text>
        </View>
      </ScrollView>
      <View className="absolute bottom-0 w-full border-t border-slate-100 bg-white p-6">
        <TouchableOpacity
          onPress={handleSave}
          className="w-full items-center justify-center rounded-full bg-blue-600 py-4 shadow-lg shadow-blue-200">
          <Text className="text-lg font-bold text-white">Simpan Pengaturan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SettingsScreen;