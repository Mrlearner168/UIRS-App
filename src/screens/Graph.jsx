import { SERVER_URL } from '@env';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import {
  BarChart,
  LineChart,
  PieChart,
  ProgressChart
} from 'react-native-chart-kit';
import EncryptedStorage from 'react-native-encrypted-storage';
import RNPickerSelect from 'react-native-picker-select';
import Icon from 'react-native-vector-icons/MaterialIcons';

const screenWidth = Dimensions.get("window").width;

const Graph = () => {
  const navigation = useNavigation();
  const [graphData, setGraphData] = useState([]);
  const [statisticsData, setStatisticsData] = useState([]);
  const [pendingIncidents, setPendingIncidents] = useState(0);
  const [doneIncidents, setDoneIncidents] = useState(0);
  const [alertIncidents, setAlertIncidents] = useState(0);
  const [token, setToken] = useState(null);

  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChart, setSelectedChart] = useState('bar');
  const [selectedFilter, setSelectedFilter] = useState('All');

  // Fetch token on mount
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem('token');
        if (storedToken) {
          setToken(storedToken);
        } else {
          navigation.navigate("Login");
        }
      } catch (error) {
        console.log('Error fetching token:', error);
        Alert.alert("Error", "Failed to fetch authentication token.");
      }
    };
    fetchToken();
  }, [navigation]);

  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    if (!refreshing) setIsLoading(true);

    try {
      // Fetch Statistics
      const statsResponse = await fetch(`${SERVER_URL}/incidents_statistics`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (statsResponse.ok) {
        const data = await statsResponse.json();
        if (Array.isArray(data)) {
          setStatisticsData(data);
          setPendingIncidents(data.find(item => item.label === "pending")?.count || 0);
          setDoneIncidents(data.find(item => item.label === "done")?.count || 0);
          setAlertIncidents(data.find(item => item.label === "alert")?.count || 0);
        }
      }

      // Fetch Graph Data
      // Note: Assuming this endpoint might also need auth, added header just in case. 
      // If it fails without auth, remove the header object.
      const graphResponse = await fetch(`${SERVER_URL}/incidents_graph`, {
         headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (graphResponse.ok) {
        const gData = await graphResponse.json();
        setGraphData(gData);
      }

    } catch (error) {
      console.log("Error fetching dashboard data:", error);
      Alert.alert("Error", "Failed to load dashboard data. Please check your connection.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [token, refreshing]);

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  }, [token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  // Filtered graph data
  const filteredData = selectedFilter === 'All'
    ? graphData
    : graphData.filter(item => item.label === selectedFilter);

  const counts = filteredData.map(item => item.count);
  const labels = filteredData.map(item => item.label);
  // Ensure we don't divide by zero if counts are empty
  const maxValue = counts.length > 0 ? Math.max(...counts) : 10;

  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 123, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: {
      r: "5",
      strokeWidth: "2",
      stroke: "#007BFF"
    },
    barPercentage: 0.7,
    fillShadowGradient: '#007BFF',
    fillShadowGradientOpacity: 0.3,
  };

  const renderChart = () => {
    if (counts.length === 0) {
        return (
            <View style={styles.noDataContainer}>
                <Icon name="insert-chart-outlined" size={50} color="#ccc" />
                <Text style={styles.noDataText}>No data available for this filter.</Text>
            </View>
        );
    }

    const commonProps = {
        width: screenWidth - 60, // consistent width with padding
        height: 240,
        chartConfig: chartConfig,
        style: styles.chartStyle
    };

    switch (selectedChart) {
      case 'bar':
        return (
          <BarChart
            data={{ labels, datasets: [{ data: counts }] }}
            yAxisInterval={1}
            fromZero
            showValuesOnTopOfBars
            segments={4}
            {...commonProps}
          />
        );
      case 'line':
        return (
          <LineChart
            data={{ labels, datasets: [{ data: counts }] }}
            bezier
            {...commonProps}
          />
        );
      case 'pie':
        return (
          <PieChart
            data={filteredData.map((item, index) => ({
              name: item.label,
              population: item.count,
              color: [
                  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
              ][index % 6],
              legendFontColor: "#555",
              legendFontSize: 12
            }))}
            width={screenWidth - 40}
            height={220}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
            style={styles.chartStyle}
          />
        );
      case 'progress':
        // Progress chart expects values between 0 and 1
        const progressData = {
            labels: labels.slice(0, 3), // Limit to top 3 to avoid clutter
            data: counts.slice(0, 3).map(val => val / (Math.max(...counts) || 1))
        };
        return (
          <ProgressChart
            data={progressData}
            {...commonProps}
            height={220}
            strokeWidth={12}
            radius={28}
            hideLegend={false}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Dashboard & Analytics</Text>
      </View>

      {isLoading && !refreshing ? (
          <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007BFF" />
          </View>
      ) : (
          <>
            {/* Stats Cards */}
            <View style={styles.cardsContainer}>
                <View style={[styles.card, styles.cardPending]}>
                    <View style={styles.cardHeader}>
                        <Icon name="hourglass-empty" size={24} color="#D97706" />
                        <Text style={[styles.cardLabel, { color: '#D97706' }]}>Pending</Text>
                    </View>
                    <Text style={styles.cardValue}>{pendingIncidents}</Text>
                </View>

                <View style={[styles.card, styles.cardDone]}>
                    <View style={styles.cardHeader}>
                        <Icon name="check-circle" size={24} color="#059669" />
                        <Text style={[styles.cardLabel, { color: '#059669' }]}>Done</Text>
                    </View>
                    <Text style={styles.cardValue}>{doneIncidents}</Text>
                </View>

                <View style={[styles.card, styles.cardAlert]}>
                    <View style={styles.cardHeader}>
                        <Icon name="warning" size={24} color="#DC2626" />
                        <Text style={[styles.cardLabel, { color: '#DC2626' }]}>Alerts</Text>
                    </View>
                    <Text style={styles.cardValue}>{alertIncidents}</Text>
                </View>
            </View>

            {/* Main Content Area */}
            <View style={styles.sectionContainer}>
                <View style={styles.rowBetween}>
                    <Text style={styles.sectionTitle}>Incident Trends</Text>
                    
                    {/* Filter Picker */}
                    <View style={styles.pickerWrapper}>
                        <RNPickerSelect
                            value={selectedFilter}
                            onValueChange={value => setSelectedFilter(value)}
                            placeholder={{}} // Removes default placeholder
                            items={[
                                { label: "All Types", value: "All" },
                                ...graphData.map(item => ({ label: item.label, value: item.label }))
                            ]}
                            style={pickerSelectStyles}
                            useNativeAndroidPickerStyle={false}
                            Icon={() => <Icon name="filter-list" size={20} color="#6B7280" style={{marginTop: 10, marginRight: 5}} />}
                        />
                    </View>
                </View>

                {/* Chart Type Selector */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartTypeContainer}>
                    {['bar', 'line', 'pie', 'progress'].map(type => (
                        <TouchableOpacity
                            key={type}
                            onPress={() => setSelectedChart(type)}
                            style={[
                                styles.chartTypeButton,
                                selectedChart === type && styles.activeChartButton
                            ]}
                        >
                            <Icon 
                                name={
                                    type === 'bar' ? 'bar-chart' : 
                                    type === 'line' ? 'show-chart' : 
                                    type === 'pie' ? 'pie-chart' : 'donut-large'
                                } 
                                size={18} 
                                color={selectedChart === type ? '#fff' : '#6B7280'} 
                                style={{marginRight: 6}}
                            />
                            <Text style={[
                                styles.chartTypeText,
                                selectedChart === type && styles.activeChartText
                            ]}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Graph Card */}
                <View style={styles.chartCard}>
                    {renderChart()}
                </View>
            </View>

            {/* Detailed Statistics List */}
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Detailed Breakdown</Text>
                <View style={styles.statsList}>
                    {statisticsData.length > 0 ? statisticsData.map((item, index) => (
                        <View key={index} style={styles.statRow}>
                            <View style={styles.statLabelRow}>
                                <View style={[styles.dot, { backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'][index % 4] }]} />
                                <Text style={styles.statLabel}>{item.label}</Text>
                            </View>
                            <Text style={styles.statCount}>{item.count}</Text>
                        </View>
                    )) : (
                        <Text style={styles.noDataText}>No detailed statistics available.</Text>
                    )}
                </View>
            </View>
          </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: { flexGrow: 1, backgroundColor: "#F3F4F6", paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  
  headerContainer: { padding: 22, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 26, fontWeight: '700', color: '#1F2937' },

  // Stats Cards
  cardsContainer: { flexDirection: "row", justifyContent: "space-between", padding: 16, gap: 10 },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 110,
    justifyContent: 'space-between'
  },
  cardPending: { borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  cardDone: { borderLeftWidth: 4, borderLeftColor: '#10B981' },
  cardAlert: { borderLeftWidth: 4, borderLeftColor: '#EF4444' },
  
  cardHeader: { flexDirection: 'column', alignItems: 'flex-start', gap: 6 },
  cardLabel: { fontSize: 13, fontWeight: "700", textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 28, fontWeight: "800", color: "#1F2937" },

  // Sections
  sectionContainer: { marginTop: 10, paddingHorizontal: 16, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },

  // Picker
  pickerWrapper: {
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#D1D5DB',
      overflow: 'hidden',
      minWidth: 140,
      height: 40,
      justifyContent: 'center'
  },

  // Chart Type Tabs
  chartTypeContainer: { flexDirection: 'row', marginBottom: 16 },
  chartTypeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: '#E5E7EB',
      marginRight: 8,
  },
  activeChartButton: { backgroundColor: '#007BFF' },
  chartTypeText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  activeChartText: { color: '#fff' },

  // Chart Area
  chartCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 250,
    justifyContent: 'center'
  },
  chartStyle: { borderRadius: 16 },
  noDataContainer: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  noDataText: { color: "#9CA3AF", marginTop: 10, fontSize: 14 },

  // Statistics List
  statsList: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  statLabel: { fontSize: 15, color: '#374151', fontWeight: '500' },
  statCount: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
});

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#374151',
    paddingRight: 30, // to ensure the text is never behind the icon
  },
  inputAndroid: {
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: '#374151',
    paddingRight: 30, // to ensure the text is never behind the icon
  },
});

export default Graph;