import { SERVER_URL } from '@env';
import axios from 'axios';
import { createContext, useContext, useEffect, useState } from 'react';
import EncryptedStorage from 'react-native-encrypted-storage';
import { AuthContext } from './AuthContext';

export const IncidentStationMapContext = createContext({});

export const IncidentStationMapProvider = ({ children }) => {
  const [stationMap, setStationMap] = useState({});
  const { authData } = useContext(AuthContext); // get token from auth

  const fetchMap = async (token) => {
    if (!token) return;
    try {
      const { data } = await axios.get(`${SERVER_URL}/incident_station_map`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStationMap(data);
      await EncryptedStorage.setItem('incident_station_map', JSON.stringify(data));
    } catch (err) {
      const cached = await EncryptedStorage.getItem('incident_station_map');
      if (cached) setStationMap(JSON.parse(cached));
    }
  };

  useEffect(() => {
    if (!authData.token) return; // wait until login completes

    fetchMap(authData.token); // fetch immediately after login
    const interval = setInterval(() => fetchMap(authData.token), 150000);

    return () => clearInterval(interval);
  }, [authData.token]); // refetch whenever token changes

  return (
    <IncidentStationMapContext.Provider value={{ stationMap }}>
      {children}
    </IncidentStationMapContext.Provider>
  );
};
