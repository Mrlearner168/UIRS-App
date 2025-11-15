
import EncryptedStorage from 'react-native-encrypted-storage';
import i18n from './i18n'; // adjust path to your i18n setup

export const setAppLanguage = async (lang) => {
  try {
    await EncryptedStorage.setItem('userLanguage', lang);
    i18n.changeLanguage(lang);
  } catch (e) {
    console.log('Error saving language:', e);
  }
};

export const getAppLanguage = async () => {
  try {
    const lang = await EncryptedStorage.getItem('userLanguage');
    if (lang) {
      i18n.changeLanguage(lang);
      return lang;
    }
    return 'en';
  } catch (e) {
    console.log('Error getting language:', e);
    return 'en';
  }
};
export const loadAppLanguage = async () => {
  const lang = await EncryptedStorage.getItem('userLanguage');
  if (lang) i18n.changeLanguage(lang);
  return lang || 'en';
};