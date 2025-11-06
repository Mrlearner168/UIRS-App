import { SERVER_URL } from '@env';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import {
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

  // Fetch statistics
  const fetchStatistics = async () => {
    try {
      if (!token) return;
      const response = await fetch(`${SERVER_URL}/incidents_statistics`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();

      if (!Array.isArray(data)) {
        setStatisticsData([]);
        return;
      }

      setStatisticsData(data);
      setPendingIncidents(data.find(item => item.label === "pending")?.count || 0);
      setDoneIncidents(data.find(item => item.label === "done")?.count || 0);
      setAlertIncidents(data.find(item => item.label === "alert")?.count || 0);
    } catch (error) {
      console.log("Error fetching statistics data:", error);
      setStatisticsData([]);
    }
  };
  // Check login token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem("token");
        if (!storedToken) navigation.navigate("Login");
      } catch (error) {
        Alert.alert("Error", "Failed to fetch authentication token.");
      }
    };
    fetchToken();
  }, []);


  // Fetch graph
  const fetchGraph = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/incidents_graph`);
      const data = await response.json();
      setGraphData(data);
    } catch (error) {
      console.log("Error fetching graph data:", error);
    }
  };

  useEffect(() => {
    if (token) {
      fetchStatistics();
      fetchGraph();
    }
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStatistics();
    await fetchGraph();
    setRefreshing(false);
  };

  // Filtered graph data
  const filteredData = selectedFilter === 'All'
    ? graphData
    : graphData.filter(item => item.label === selectedFilter);

  const counts = filteredData.map(item => item.count);
  const labels = filteredData.map(item => item.label);
  const maxValue = Math.max(...counts, 1);

  const chartConfig = {
    backgroundGradientFrom: "#fdfbfb",
    backgroundGradientTo: "#ebedee",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(26, 188, 156, ${opacity})`,
    labelColor: () => "#2c3e50",
    style: { borderRadius: 16 },
    propsForDots: {
      r: "6",
      strokeWidth: "2",
      stroke: "#3498db"
    },
    barPercentage: 0.7
  };

  const renderChart = () => {
    switch (selectedChart) {
      case 'bar':
        return (
          <BarChart
            data={{ labels, datasets: [{ data: counts }] }}
            width={screenWidth * 0.95}
            height={300}
            yAxisInterval={1}
            fromZero
            showValuesOnTopOfBars
            segments={maxValue}
            chartConfig={chartConfig}
            style={styles.chart}
          />
        );
      case 'line':
        return (
          <LineChart
            data={{ labels, datasets: [{ data: counts }] }}
            width={screenWidth * 0.95}
            height={300}
            chartConfig={chartConfig}
            style={styles.chart}
          />
        );
      case 'pie':
        return (
          <PieChart
            data={filteredData.map(item => ({
              name: item.label,
              population: item.count,
              color: `rgba(${Math.floor(Math.random() * 156 + 100)}, ${Math.floor(Math.random() * 156 + 100)}, ${Math.floor(Math.random() * 156 + 100)}, 1)`,
              legendFontColor: "#555",
              legendFontSize: 14
            }))}
            width={screenWidth * 0.95}
            height={300}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="30"
            style={styles.chart}
          />
        );
      case 'progress':
        return (
          <ProgressChart
            data={{ labels, data: counts.map(val => val / maxValue) }}
            width={screenWidth * 0.95}
            height={300}
            chartConfig={chartConfig}
            style={styles.chart}
          />
        );
      default:
        return <Text>No chart selected</Text>;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Graph & statistics</Text>

      {/* Stats Cards */}
      <View style={styles.cardsContainer}>
        <View style={[styles.card, { backgroundColor: "#f39c12" }]}>
          <Text style={styles.cardLabel}>Pending</Text>
          <Text style={styles.cardValue}>{pendingIncidents}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: "#27ae60" }]}>
          <Text style={styles.cardLabel}>Done</Text>
          <Text style={styles.cardValue}>{doneIncidents}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: "#e74c3c" }]}>
          <Text style={styles.cardLabel}>Alert</Text>
          <Text style={styles.cardValue}>{alertIncidents}</Text>
        </View>
      </View>

      {/* Statistics List */}
      <View style={styles.statisticsContainer}>
        {statisticsData.map((item, index) => (
          <View key={index} style={styles.statItem}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.count}>{item.count}</Text>
          </View>
        ))}
      </View>

      {/* Graph Controls */}
      <View style={styles.controls}>
        <View style={styles.pickerContainer}>
          <RNPickerSelect
            value={selectedFilter}
            onValueChange={value => setSelectedFilter(value)}
            placeholder={{ label: "Filter by Type", value: "All" }}
            items={[
              { label: "All", value: "All" },
              ...graphData.map(item => ({ label: item.label, value: item.label }))
            ]}
            style={pickerSelectStyles}
          />
        </View>

        <View style={styles.buttonGroup}>
          {['bar', 'line', 'pie', 'progress'].map(type => (
            <TouchableOpacity
              key={type}
              onPress={() => setSelectedChart(type)}
              style={[
                styles.chartTypeButton,
                selectedChart === type && styles.activeButton
              ]}
            >
              <Text style={styles.buttonText}>{type.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Graph */}
      <View style={styles.chartCard}>
        {filteredData.length > 0 ? renderChart() : <Text style={styles.noData}>No data available.</Text>}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    alignItems: "center",
    backgroundColor: "#f7f9fa",
    paddingBottom: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#2c3e50",
    marginVertical: 20,
  },
  cardsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: screenWidth * 0.95,
    marginBottom: 20,
  },
  card: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    elevation: 3,
  },
  cardLabel: {
    fontSize: 16,
    color: "#fff",
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
  },
  statisticsContainer: {
    width: screenWidth * 0.95,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowColor: "#aaa",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  statItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ecf0f1",
  },
  label: {
    fontSize: 16,
    color: "#2c3e50",
  },
  count: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1abc9c",
  },
  controls: {
    width: screenWidth * 0.95,
    marginBottom: 20,
  },
  pickerContainer: {
    backgroundColor: "#ecf0f1",
    borderRadius: 10,
    padding: 5,
    marginBottom: 10,
  },
  buttonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  chartTypeButton: {
    flex: 1,
    marginHorizontal: 5,
    backgroundColor: "#dfe6e9",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  activeButton: {
    backgroundColor: "#1abc9c",
  },
  buttonText: {
    color: "#2c3e50",
    fontWeight: "600",
  },
  chartCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 10,
    width: screenWidth * 0.95,
    marginBottom: 20,
    shadowColor: "#aaa",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  chart: {
    borderRadius: 16,
  },
  noData: {
    color: "#7f8c8d",
    textAlign: "center",
    fontSize: 16,
    paddingVertical: 40,
  },
});

const pickerSelectStyles = {
  inputIOS: {
    color: '#2c3e50',
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputAndroid: {
    color: '#2c3e50',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
};

export default Graph;
