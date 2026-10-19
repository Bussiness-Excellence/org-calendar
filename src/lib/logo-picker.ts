import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import type { LogoUpload } from './calendar-context';
import { t } from '@/lib/i18n';

export interface PickedLogo extends LogoUpload {
  uri: string;
}

const MAX_BYTES = 1.8 * 1024 * 1024;

/** Shrinks an image on the web so logos upload fast (max 512px, PNG). */
async function shrinkOnWeb(dataUri: string): Promise<PickedLogo> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(t('That image could not be opened.')));
    el.src = dataUri;
  });
  const scale = Math.min(1, 512 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('That image could not be processed.'));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const uri = canvas.toDataURL('image/png');
  return { uri, base64: uri.split(',')[1] ?? '', mime: 'image/png' };
}

/** Lets the user choose a logo. Returns null if they cancel. */
export async function pickLogo(): Promise<PickedLogo | null> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error(t('Allow photo access to choose a logo.'));
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: Platform.OS !== 'web',
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];

  if (Platform.OS === 'web') {
    const dataUri = asset.uri.startsWith('data:')
      ? asset.uri
      : `data:${asset.mimeType ?? 'image/png'};base64,${asset.base64 ?? ''}`;
    return shrinkOnWeb(dataUri);
  }

  const base64 = asset.base64 ?? '';
  if (!base64) throw new Error(t('That image could not be read. Try another one.'));
  if (base64.length * 0.75 > MAX_BYTES) throw new Error(t('Choose a smaller image (under 2 MB).'));
  const mime = asset.mimeType && /png|jpe?g|webp/.test(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  return { uri: asset.uri, base64, mime: mime === 'image/jpg' ? 'image/jpeg' : mime };
}
