import { SERVER_URL } from '@env';
import axios from 'axios';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import EncryptedStorage from 'react-native-encrypted-storage';
import { AuthContext } from './AuthContext';

export const IncidentStationMapContext = createContext({});

export const IncidentStationMapProvider = ({ children }) => {
  const [stationMap, setStationMap] = useState({});
  const [loading, setLoading] = useState(true);
  const { authData } = useContext(AuthContext);
  const fetchIntervalRef = useRef(null);

  // Load from cache immediately on app start (FASTEST)
  useEffect(() => {
    const loadCachedMap = async () => {
      try {
        const cached = await EncryptedStorage.getItem('incident_station_map');
        if (cached) {
          setStationMap(JSON.parse(cached));
          console.log('Station map loaded from cache.');
        }
      } catch (error) {
        console.log('Error loading cached station map:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCachedMap();
  }, []);

  // Fetch fresh data in background
  const fetchMap = async (token) => {
    if (!token) return;
    try {
      const { data } = await axios.get(`${SERVER_URL}/incident_station_map`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      setStationMap(data);
      await EncryptedStorage.setItem('incident_station_map', JSON.stringify(data));
      console.log('Station map updated.');
    } catch (err) {
      console.log('Error fetching station map:', err.message);
      // Keep using cached version
    }
  };

  // Fetch on login and set up refresh interval
  useEffect(() => {
    if (!authData.token) {
      // Clear interval if user logs out
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
      return;
    }

    // Fetch immediately
    fetchMap(authData.token);

    // Auto-refresh every 150 seconds
    fetchIntervalRef.current = setInterval(() => {
      fetchMap(authData.token);
    }, 150000);

    return () => {
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
    };
  }, [authData.token]);

  return (
    <IncidentStationMapContext.Provider value={{ stationMap, loading }}>
      {children}
    </IncidentStationMapContext.Provider>
  );
};
