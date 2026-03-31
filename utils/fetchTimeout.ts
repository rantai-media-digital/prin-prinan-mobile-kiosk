import { Alert } from 'react-native';

export const fetchTimeout = async (
  url: string,
  { timeout = 5000, ...fetchOptions }: RequestInit & { timeout?: number } = {}
) => {
  try {
    const controller = new AbortController();

    const abort = setTimeout(() => {
      controller.abort();
    }, timeout);

    const response = await globalThis.fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(abort);
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('Fetch request timed out');
      Alert.alert(
        'Error',
        'Server memakan waktu lama untuk merespon. Mohon coba lagi.'
      );
    } else {
      console.error('Fetch error:', error.message);
      Alert.alert(
        'Error', 'Terjadi kesalahan saat melakukan panggilan ke server. Mohon hubungi admin.'
      );
    }
    throw error;
  }
};
