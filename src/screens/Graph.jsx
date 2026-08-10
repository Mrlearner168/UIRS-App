import { SERVER_URL } from '@env';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  RefreshControl,
  SafeAreaView,
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

// Ultra-Modern White / Light Theme Palette
const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  
  // Vibrant Primary Accents
  primary: '#0284C7',
  primaryGlow: 'rgba(2, 132, 199, 0.08)',
  
  pending: '#D97706',
  pendingBg: 'rgba(217, 119, 6, 0.08)',
  pendingBorder: 'rgba(217, 119, 6, 0.25)',

  done: '#059669',
  doneBg: 'rgba(5, 150, 105, 0.08)',
  doneBorder: 'rgba(5, 150, 105, 0.25)',

  alert: '#E11D48',
  alertBg: 'rgba(225, 29, 72, 0.08)',
  alertBorder: 'rgba(225, 29, 72, 0.25)',

  // Dynamic Chart & Category Palette
  chartColors: ['#0284C7', '#059669', '#D97706', '#9333EA', '#DB2777', '#0891B2'],
  severity: {
    low: '#0284C7',
    moderate: '#D97706',
    high: '#EA580C',
    critical: '#E11D48',
    extreme: '#9F1239'
  }
};

const GRAPH_SORT_OPTIONS = [
  { label: "Oldest First", value: "created_at|asc" },
  { label: "Newest First", value: "created_at|desc" },
  { label: "Highest Severity", value: "severity_level|desc" },
  { label: "Lowest Severity", value: "severity_level|asc" },
  { label: "Barangay (A-Z)", value: "barangay|asc" },
  { label: "Barangay (Z-A)", value: "barangay|desc" },
  { label: "Municipality (A-Z)", value: "municipality|asc" },
  { label: "Municipality (Z-A)", value: "municipality|desc" },
  { label: "Province (A-Z)", value: "province|asc" },
  { label: "Province (Z-A)", value: "province|desc" },
  { label: "Status", value: "status|asc" }
];

const LIST_SORT_OPTIONS = [
  { label: "Newest First", value: "created_at|desc" },
  { label: "Oldest First", value: "created_at|asc" },
  { label: "Highest Severity", value: "severity_level|desc" },
  { label: "Lowest Severity", value: "severity_level|asc" },
  { label: "Barangay (A-Z)", value: "barangay|asc" },
  { label: "Barangay (Z-A)", value: "barangay|desc" },
  { label: "Municipality (A-Z)", value: "municipality|asc" },
  { label: "Municipality (Z-A)", value: "municipality|desc" },
  { label: "Province (A-Z)", value: "province|asc" },
  { label: "Province (Z-A)", value: "province|desc" },
  { label: "Status", value: "status|asc" }
];

const Graph = () => {
  const navigation = useNavigation();
  
  // App & Global State
  const [token, setToken] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);

  // Stats State
  const [statisticsData, setStatisticsData] = useState([]);
  const [pendingIncidents, setPendingIncidents] = useState(0);
  const [doneIncidents, setDoneIncidents] = useState(0);
  const [alertIncidents, setAlertIncidents] = useState(0);
  
  // Graph State
  const [graphData, setGraphData] = useState([]);
  const [graphSortOption, setGraphSortOption] = useState('created_at|asc'); 
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [selectedChart, setSelectedChart] = useState('bar');
  
  // List State
  const [incidentList, setIncidentList] = useState([]);
  const [sortOption, setSortOption] = useState('created_at|desc');
  const [isListLoading, setIsListLoading] = useState(false);
  
  // Fetch token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem('token');
        if (storedToken) setToken(storedToken);
        else navigation.navigate("Login");
      } catch (error) {
        Alert.alert("Error", "Failed to fetch authentication token.");
      }
    };
    fetchToken();
  }, [navigation]);

  // Dashboard Stats
  const fetchDashboardStats = useCallback(async () => {
    if (!token) return;
    if (!refreshing) setIsDashboardLoading(true);

    try {
      const response = await fetch(`${SERVER_URL}/incidents_statistics`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setStatisticsData(data);
          setPendingIncidents(data.find(item => item.label.toLowerCase() === "ongoing")?.count || 0);
          setDoneIncidents(data.find(item => item.label.toLowerCase() === "done")?.count || 0);
          setAlertIncidents(data.find(item => item.label.toLowerCase() === "alert")?.count || 0);
        }
      }
    } catch (error) {
      console.log("Error fetching stats:", error);
    } finally {
      setIsDashboardLoading(false);
    }
  }, [token, refreshing]);

  // Graph Data
  const fetchGraphData = useCallback(async () => {
    if (!token) return;
    setIsGraphLoading(true);
    
    const [sortBy, order] = graphSortOption.split('|');

    try {
      const response = await fetch(`${SERVER_URL}/incidents_list?sort_by=${sortBy}&order=${order}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const rawData = await response.json();
        const countsMap = new Map(); 

        rawData.forEach(incident => {
          let label = "Unknown";
          
          if (sortBy === 'barangay') {
             label = incident.barangay || 'Unknown';
          } else if (sortBy === 'municipality') {
             label = incident.municipality || 'Unknown';
          } else if (sortBy === 'province') {
             label = incident.province || 'Unknown';
          } else if (sortBy === 'severity_level') {
             label = incident.severity_label ? incident.severity_label.toUpperCase() : 'Unknown';
          } else if (sortBy === 'status') {
             label = incident.status ? incident.status.toUpperCase() : 'Unknown';
          } else if (sortBy === 'created_at') {
             if (incident.created_at) {
                const date = new Date(incident.created_at);
                label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
             }
          }

          countsMap.set(label, (countsMap.get(label) || 0) + 1);
        });

        const formattedGraphData = Array.from(countsMap, ([label, count]) => ({ label, count }));
        setGraphData(formattedGraphData);
      }
    } catch (error) {
      console.log("Error fetching graph data:", error);
    } finally {
      setIsGraphLoading(false);
    }
  }, [token, graphSortOption]);

  // Incident List
  const fetchIncidentList = useCallback(async () => {
    if (!token) return;
    setIsListLoading(true);
    
    const [sortBy, order] = sortOption.split('|');

    try {
      const response = await fetch(`${SERVER_URL}/incidents_list?sort_by=${sortBy}&order=${order}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const listData = await response.json();
        setIncidentList(listData);
      }
    } catch (error) {
      console.log("Error fetching list:", error);
    } finally {
      setIsListLoading(false);
      setRefreshing(false);
    }
  }, [token, sortOption]);

  useEffect(() => {
    if (token) {
      fetchDashboardStats();
      fetchGraphData();
      fetchIncidentList();
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchGraphData();
  }, [graphSortOption]);

  useEffect(() => {
    if (token) fetchIncidentList();
  }, [sortOption]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardStats();
    fetchGraphData();
    fetchIncidentList();
  };

  const formatDate = (isoString) => {
    if (!isoString) return "Unknown Date";
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  const getSeverityColor = (label) => {
    const key = String(label).toLowerCase();
    return COLORS.severity[key] || COLORS.textMuted;
  };

  const activeGraphSortLabel = GRAPH_SORT_OPTIONS.find(opt => opt.value === graphSortOption)?.label || "Date";

  const counts = graphData.map(item => item.count);
  const labels = graphData.map(item => item.label);
  const maxValue = counts.length > 0 ? Math.max(...counts) : 1;

  const chartConfig = {
    backgroundGradientFrom: COLORS.card,
    backgroundGradientTo: COLORS.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(2, 132, 199, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(71, 85, 105, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "5", strokeWidth: "2", stroke: COLORS.primary },
    barPercentage: 0.6,
  };

  const renderChart = () => {
    if (isGraphLoading) {
      return (
        <View style={[styles.noDataContainer, { height: 220 }]}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.noDataText}>Syncing Telemetry...</Text>
        </View>
      );
    }

    if (counts.length === 0) {
        return (
            <View style={[styles.noDataContainer, { height: 220 }]}>
                <Icon name="insert-chart-outlined" size={48} color={COLORS.cardBorder} />
                <Text style={styles.noDataText}>No records matching criteria.</Text>
            </View>
        );
    }

    const commonProps = {
        width: screenWidth - 48,
        height: 220,
        chartConfig,
        style: styles.chartStyle
    };

    switch (selectedChart) {
      case 'bar':
        return <BarChart data={{ labels, datasets: [{ data: counts }] }} yAxisInterval={1} fromZero showValuesOnTopOfBars segments={4} {...commonProps} />;
      case 'line':
        return <LineChart data={{ labels, datasets: [{ data: counts }] }} bezier fromZero segments={4} {...commonProps} />;
      case 'pie':
        return (
          <PieChart
            data={graphData.map((item, index) => ({
              name: item.label,
              population: item.count,
              color: COLORS.chartColors[index % COLORS.chartColors.length],
              legendFontColor: COLORS.textSecondary,
              legendFontSize: 12
            }))}
            width={screenWidth - 48} height={220} chartConfig={chartConfig}
            accessor="population" backgroundColor="transparent" paddingLeft="10" absolute style={styles.chartStyle}
          />
        );
      case 'progress':
        return (
          <ProgressChart
            data={{ labels: labels.slice(0, 4), data: counts.slice(0, 4).map(val => val / maxValue) }}
            {...commonProps} height={220} strokeWidth={12} radius={28} hideLegend={false}
            chartConfig={{ ...chartConfig, color: (opacity = 1, index = 0) => COLORS.chartColors[index % COLORS.chartColors.length] }}
          />
        );
      default: return null;
    }
  };

  const totalStatCount = statisticsData.reduce((acc, curr) => acc + (curr.count || 0), 0) || 1;
  const maxStatCount = statisticsData.length > 0 ? Math.max(...statisticsData.map(d => d.count)) : 1;

  // Header Dashboard View
  const renderDashboardHeader = () => (
    <View style={styles.headerWrapper}>
      {/* Light Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.brandRow}>
            <View style={styles.neonDot} />
            <Text style={styles.brandTitle}>SYSTEM COMMAND</Text>
          </View>
          <Text style={styles.headerTitle}>Incident Dashboard</Text>
        </View>

        <View style={styles.profileBadge}>
          <Icon name="verified-user" size={16} color={COLORS.primary} />
          <Text style={styles.profileBadgeText}>ONLINE</Text>
        </View>
      </View>

      {isDashboardLoading && !refreshing ? (
          <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
      ) : (
          <>
            {/* KPI Cards */}
            <View style={styles.cardsContainer}>
                <View style={[styles.card, { borderColor: COLORS.pendingBorder }]}>
                    <View style={[styles.iconWrapper, { backgroundColor: COLORS.pendingBg }]}>
                      <Icon name="hourglass-empty" size={20} color={COLORS.pending} />
                    </View>
                    <Text style={styles.cardValue}>{pendingIncidents}</Text>
                    <Text style={styles.cardLabel}>ONGOING</Text>
                </View>

                <View style={[styles.card, { borderColor: COLORS.doneBorder }]}>
                    <View style={[styles.iconWrapper, { backgroundColor: COLORS.doneBg }]}>
                      <Icon name="check-circle-outline" size={20} color={COLORS.done} />
                    </View>
                    <Text style={styles.cardValue}>{doneIncidents}</Text>
                    <Text style={styles.cardLabel}>RESOLVED</Text>
                </View>

                <View style={[styles.card, { borderColor: COLORS.alertBorder }]}>
                    <View style={[styles.iconWrapper, { backgroundColor: COLORS.alertBg }]}>
                      <Icon name="warning-amber" size={20} color={COLORS.alert} />
                    </View>
                    <Text style={styles.cardValue}>{alertIncidents}</Text>
                    <Text style={styles.cardLabel}>ALERTS</Text>
                </View>
            </View>

            {/* Interactive Visual Chart */}
            <View style={styles.sectionContainer}>
                <View style={styles.rowBetween}>
                    <Text style={[styles.sectionTitle, { flex: 1, marginRight: 8 }]}>
                       Trends by {activeGraphSortLabel}
                    </Text>
                    <View style={styles.pickerWrapper}>
                        <RNPickerSelect
                            value={graphSortOption}
                            onValueChange={(val) => val && setGraphSortOption(val)}
                            items={GRAPH_SORT_OPTIONS}
                            style={pickerSelectStyles} useNativeAndroidPickerStyle={false}
                            Icon={() => <Icon name="tune" size={16} color={COLORS.primary} style={{marginTop: 9, marginRight: 8}} />}
                        />
                    </View>
                </View>
                
                {/* Chart Segment Switches */}
                <View style={styles.chartTabsWrapper}>
                  <FlatList 
                    horizontal showsHorizontalScrollIndicator={false}
                    data={['bar', 'line', 'pie', 'progress']}
                    keyExtractor={item => item}
                    renderItem={({item: type}) => (
                      <TouchableOpacity
                          onPress={() => setSelectedChart(type)}
                          style={[styles.chartTabBtn, selectedChart === type && styles.chartTabBtnActive]}
                      >
                          <Icon 
                              name={type === 'bar' ? 'bar-chart' : type === 'line' ? 'show-chart' : type === 'pie' ? 'pie-chart' : 'donut-large'} 
                              size={15} color={selectedChart === type ? '#FFFFFF' : COLORS.textSecondary} style={{marginRight: 6}}
                          />
                          <Text style={[styles.chartTabText, selectedChart === type && styles.chartTabTextActive]}>
                              {type.toUpperCase()}
                          </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
                
                <View style={styles.chartContainer}>{renderChart()}</View>
            </View>

            {/* Telemetry Breakdown */}
            <View style={[styles.sectionContainer, { marginBottom: 28 }]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Telemetry Breakdown</Text>
                  <View style={styles.liveBadge}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.liveBadgeText}>STREAMING</Text>
                  </View>
                </View>

                {statisticsData.length > 0 ? (
                  <View style={styles.cyberBreakdownGrid}>
                    {statisticsData.map((item, index) => {
                      const accentColor = COLORS.chartColors[index % COLORS.chartColors.length];
                      const percentage = Math.round((item.count / totalStatCount) * 100) || 0;
                      const fillWidth = `${(item.count / maxStatCount) * 100}%`;

                      return (
                        <View key={index} style={styles.cyberCard}>
                          <View style={[styles.cyberCardTopLine, { backgroundColor: accentColor }]} />
                          
                          <View style={styles.cyberCardBody}>
                            <View style={styles.cyberRowHeader}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                <Text style={[styles.cyberIndex, { color: accentColor }]}>
                                  #{String(index + 1).padStart(2, '0')}
                                </Text>
                                <Text style={styles.cyberLabel} numberOfLines={1}>{item.label}</Text>
                              </View>
                              
                              <View style={[styles.cyberPill, { backgroundColor: `${accentColor}12`, borderColor: `${accentColor}30` }]}>
                                <Text style={[styles.cyberPillText, { color: accentColor }]}>
                                  {percentage}%
                                </Text>
                              </View>
                            </View>

                            <View style={styles.cyberMetricRow}>
                              <Text style={styles.cyberCountValue}>{item.count}</Text>
                              <Text style={styles.cyberCountSubtext}>INCIDENTS REGISTERED</Text>
                            </View>

                            <View style={styles.cyberMeterTrack}>
                              <View style={[styles.cyberMeterFill, { width: fillWidth, backgroundColor: accentColor }]} />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.cyberEmptyCard}>
                    <Icon name="radar" size={32} color={COLORS.textMuted} />
                    <Text style={styles.noDataText}>No detailed metrics loaded.</Text>
                  </View>
                )}
            </View>

            {/* Incident Log Controls */}
            <View style={styles.sectionContainer}>
               <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Activity Stream</Text>
                  <View style={styles.pickerWrapper}>
                      <RNPickerSelect
                          value={sortOption}
                          onValueChange={(val) => val && setSortOption(val)}
                          items={LIST_SORT_OPTIONS}
                          style={pickerSelectStyles} useNativeAndroidPickerStyle={false}
                          Icon={() => <Icon name="tune" size={16} color={COLORS.primary} style={{marginTop: 9, marginRight: 8}} />}
                      />
                  </View>
               </View>
            </View>
          </>
      )}
    </View>
  );

  // Modern White Incident Stream Item
  const renderIncidentCard = ({ item }) => {
    const sevColor = getSeverityColor(item.severity_label);
    const brgy = item.barangay || "Unknown Brgy";
    const muni = item.municipality || "Unknown Muni";
    const prov = item.province ? `, ${item.province}` : "";

    const statusColor = item.status === 'done' ? COLORS.done : item.status === 'alert' ? COLORS.alert : COLORS.pending;

    return (
      <View style={styles.incidentCard}>
        <View style={[styles.incidentAccentBar, { backgroundColor: sevColor }]} />
        <View style={styles.incidentCardInner}>
          <View style={styles.incidentHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.incidentType}>{item.incident_type || "Unknown Incident"}</Text>
              {item.subtype && (
                <Text style={styles.incidentSubtype}>{item.subtype}</Text>
              )}
            </View>

            <View style={[styles.badge, { backgroundColor: `${sevColor}12`, borderColor: `${sevColor}40` }]}>
              <Text style={[styles.badgeText, { color: sevColor }]}>{item.severity_label?.toUpperCase()}</Text>
            </View>
          </View>
          
          <View style={styles.incidentMetaRow}>
            <Icon name="schedule" size={14} color={COLORS.textMuted} />
            <Text style={styles.incidentDate}>{formatDate(item.created_at)}</Text>
          </View>
          
          <View style={styles.incidentFooter}>
            <View style={styles.locationChip}>
              <Icon name="place" size={13} color={COLORS.primary} style={{marginRight: 4}} />
              <Text style={styles.incidentLocation} numberOfLines={1}>
                {brgy}, {muni}{prov}
              </Text>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}12`, borderColor: `${statusColor}30` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {item.status?.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={incidentList}
        keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
        renderItem={renderIncidentCard}
        ListHeaderComponent={renderDashboardHeader}
        ListEmptyComponent={
          isListLoading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No incident logs recorded.</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerWrapper: { 
    paddingBottom: 4 
  },
  listContent: { 
    flexGrow: 1, 
    paddingBottom: 40 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  neonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 6,
  },
  brandTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryGlow,
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  profileBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  noDataContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    width: '100%'
  },
  noDataText: {
    color: COLORS.textMuted,
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
  },
  cardsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    width: (screenWidth - 48) / 3,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  cardLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  pickerWrapper: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    width: 170,
    height: 36,
    justifyContent: 'center',
  },
  chartTabsWrapper: { 
    marginBottom: 14 
  },
  chartTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginRight: 8,
  },
  chartTabBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chartTabText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  chartTabTextActive: {
    color: '#FFFFFF',
  },
  chartContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 250, 
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  chartStyle: {
    borderRadius: 16,
  },

  /* BREAKDOWN STYLES */
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginRight: 6,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.8,
  },
  cyberBreakdownGrid: {
    gap: 10,
  },
  cyberCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cyberCardTopLine: {
    height: 3,
    width: '100%',
  },
  cyberCardBody: {
    padding: 14,
  },
  cyberRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cyberIndex: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginRight: 8,
  },
  cyberLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cyberPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  cyberPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cyberMetricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  cyberCountValue: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  cyberCountSubtext: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  cyberMeterTrack: {
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  cyberMeterFill: {
    height: '100%',
    borderRadius: 3,
  },
  cyberEmptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderStyle: 'dashed',
  },

  /* INCIDENT CARD STYLES */
  incidentCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  incidentAccentBar: {
    width: 4,
    height: '100%',
  },
  incidentCardInner: {
    flex: 1,
    padding: 14,
  },
  incidentHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: 6 
  },
  incidentType: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: COLORS.textPrimary 
  },
  incidentSubtype: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500'
  },
  badge: { 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: { 
    fontSize: 9, 
    fontWeight: '900', 
    letterSpacing: 0.5 
  },
  incidentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  incidentDate: { 
    fontSize: 12, 
    color: COLORS.textMuted, 
    marginLeft: 4,
    fontWeight: '500',
  },
  incidentFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingTop: 10, 
    borderTopWidth: 1, 
    borderTopColor: '#F1F5F9' 
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  incidentLocation: { 
    fontSize: 12, 
    color: COLORS.textSecondary, 
    fontWeight: '500',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 5,
  },
  statusText: { 
    fontSize: 10, 
    fontWeight: '800',
    letterSpacing: 0.5,
  }
});

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    fontSize: 11,
    fontWeight: '700', 
    paddingVertical: 8, 
    paddingHorizontal: 10, 
    color: COLORS.textPrimary, 
    paddingRight: 24,
  },
  inputAndroid: {
    fontSize: 11,
    fontWeight: '700', 
    paddingVertical: 6, 
    paddingHorizontal: 10, 
    color: COLORS.textPrimary, 
    paddingRight: 24,
  },
});

export default Graph;