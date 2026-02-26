import { MaterialIcons as Icon } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

const NetworkAwareLabel = ({ text, type = 'drawer', color, focused }) => {
  const [status, setStatus] = useState('online'); 
  const [showMessage, setShowMessage] = useState(false);
  
  // Animation Values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-15)).current; // Starts 15px higher
  const timeoutRef = useRef(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      let currentStatus = 'online';

      if (!state.isConnected) {
        currentStatus = 'offline';
      } else if (
        state.isInternetReachable === false ||
        (state.type === 'wifi' && state.details?.strength < 50) ||
        (state.type === 'cellular' && (state.details?.cellularGeneration === '2g' || state.details?.cellularGeneration === '3g'))
      ) {
        currentStatus = 'weak';
      }

      setStatus(prevStatus => {
        if (currentStatus !== 'online' && currentStatus !== prevStatus) {
          triggerMessage();
        }
        return currentStatus;
      });
    });

    return () => {
      unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const triggerMessage = () => {
    setShowMessage(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Reset starting position
    fadeAnim.setValue(0);
    slideAnim.setValue(-15);

    // Smooth drop-down and fade-in
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 6, tension: 40, useNativeDriver: true })
    ]).start();

    // Hide after 3.5 seconds
    timeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -10, duration: 300, useNativeDriver: true })
      ]).start(() => {
        setShowMessage(false);
      });
    }, 3500);
  };

  const getStatusConfig = () => {
    if (status === 'offline') {
      return { 
        icon: "wifi-off", 
        color: "#E63946", // Your App's Primary Red
        overlayBg: '#E63946',
        message: "Offline - Retrying..."
      }; 
    }
    if (status === 'weak') {
      return { 
        icon: "network-check", 
        color: "#F4A261", // Your App's Warning Orange
        overlayBg: '#F4A261',
        message: "Weak Signal"
      }; 
    }
    return { icon: "wifi", color: "#2A9D8F", overlayBg: '#2A9D8F', message: "Online" }; 
  };

  const config = getStatusConfig();
  const isHeader = type === 'header';

  return (
    <View style={styles.container}>
      <View style={styles.textWrapper}>
        <Text style={[
          isHeader ? styles.headerText : styles.drawerText,
          !isHeader && { color: color, fontWeight: focused ? '700' : '500' }
        ]}>
          {text}
        </Text>
        
        {/* Always shows the icon */}
        <Icon 
          name={config.icon} 
          size={isHeader ? 22 : 18} 
          color={config.color}
          style={styles.inlineIcon}
        />
      </View>

      {/* Beautiful Floating Tooltip */}
      {showMessage && (
        <Animated.View style={[
          styles.overlayContainer, 
          { 
            backgroundColor: config.overlayBg,
            shadowColor: config.overlayBg,
            opacity: fadeAnim, 
            transform: [{ translateY: slideAnim }],
            top: isHeader ? 32 : 24, // Drop lower if in the header
            left: isHeader ? -10 : 0 // Shift slightly left in the header for balance
          }
        ]}>
          <Icon 
            name={status === 'offline' ? 'error-outline' : 'warning-amber'} 
            size={16} 
            color="#FFFFFF" 
          />
          <Text style={styles.overlayText}>
            {config.message}
          </Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
    paddingVertical: 2,
  },
  textWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 20, 
    fontWeight: '600', 
    color: '#1D3557', 
    letterSpacing: 0.3,
  },
  drawerText: {
    fontSize: 15, 
    letterSpacing: 0.2,
  },
  inlineIcon: {
    marginLeft: 8,
  },
  // Beautiful Tooltip Styles
  overlayContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20, // Perfectly rounded pill
    // Premium Shadow effect matching the background color
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: Platform.OS === 'android' ? 8 : 0, 
    zIndex: 9999,
    minWidth: 120, // Prevents it from looking squished
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 0.5,
  }
});

export default NetworkAwareLabel;