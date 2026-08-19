import React, {useEffect, useState} from 'react';
import {NativeEventEmitter, NativeModules, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

type Device = {
  id: string;
  name: string;
  rssi: number;
  connected: boolean;
  manufacturerData?: string;
};

type CharacteristicGroup = {
  service: string;
  characteristics: Array<{uuid: string; properties: number}>;
};

const {BluetoothManager} = NativeModules;
const bluetoothEvents = new NativeEventEmitter(BluetoothManager);

export default function BluetoothScanner() {
  const [state, setState] = useState('unknown');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [services, setServices] = useState<Array<{uuid: string; primary: boolean}>>([]);
  const [characteristics, setCharacteristics] = useState<CharacteristicGroup[]>([]);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    const subscriptions = [
      bluetoothEvents.addListener('BluetoothStateChanged', event => setState(event.state)),
      bluetoothEvents.addListener('BluetoothDeviceFound', (device: Device) => {
        setDevices(previous => ({...previous, [device.id]: device}));
      }),
      bluetoothEvents.addListener('BluetoothConnected', device => {
        setEvents(previous => [`Connected: ${device.name}`, ...previous]);
        setDevices(previous => ({
          ...previous,
          [device.id]: {...previous[device.id], ...device, connected: true},
        }));
      }),
      bluetoothEvents.addListener('BluetoothDisconnected', device => {
        setEvents(previous => [`Disconnected: ${device.name}`, ...previous]);
        setDevices(previous => ({
          ...previous,
          [device.id]: {...previous[device.id], connected: false},
        }));
      }),
      bluetoothEvents.addListener('BluetoothServicesDiscovered', event => {
        setServices(event.services || []);
        setCharacteristics([]);
        setEvents(previous => [`Services discovered: ${event.services?.length || 0}`, ...previous]);
      }),
      bluetoothEvents.addListener('BluetoothCharacteristicsDiscovered', event => {
        setCharacteristics(previous => [
          ...previous.filter(item => item.service !== event.service),
          {service: event.service, characteristics: event.characteristics},
        ]);
      }),
      bluetoothEvents.addListener('BluetoothError', event => {
        setEvents(previous => [`ERROR: ${event.message}`, ...previous]);
      }),
    ];

    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);

  const selected = selectedId ? devices[selectedId] : null;
  const deviceList = Object.values(devices);

  const startScan = () => {
    setDevices({});
    setSelectedId(null);
    setServices([]);
    setCharacteristics([]);
    setScanning(true);
    BluetoothManager.startScan();
  };

  const stopScan = () => {
    BluetoothManager.stopScan();
    setScanning(false);
  };

  const toggleConnection = (device: Device) => {
    setSelectedId(device.id);
    if (device.connected) {
      BluetoothManager.disconnect(device.id);
    } else {
      BluetoothManager.connect(device.id);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>KECHAODA Controller</Text>
          <Text style={styles.status}>Bluetooth: {state}</Text>
        </View>
        <TouchableOpacity style={styles.scanButton} onPress={scanning ? stopScan : startScan}>
          <Text style={styles.buttonText}>{scanning ? 'Stop Scan' : 'Scan'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.devicePanel}>
          <Text style={styles.sectionTitle}>Bluetooth Devices</Text>
          <ScrollView>
            {deviceList.length === 0 && <Text style={styles.empty}>No Bluetooth devices found.</Text>}
            {deviceList.map(device => (
              <TouchableOpacity
                key={device.id}
                style={[styles.device, selectedId === device.id && styles.selected]}
                onPress={() => toggleConnection(device)}>
                <View style={styles.deviceDetails}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceId}>{device.id}</Text>
                  <Text style={styles.rssi}>RSSI: {device.rssi} dBm</Text>
                </View>
                <Text style={styles.connection}>{device.connected ? 'Disconnect' : 'Connect'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.inspector}>
          <Text style={styles.sectionTitle}>Device Inspector</Text>
          {selected ? (
            <ScrollView>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{selected.name}</Text>
              <Text style={styles.label}>UUID</Text>
              <Text style={styles.value}>{selected.id}</Text>
              <Text style={styles.label}>RSSI</Text>
              <Text style={styles.value}>{selected.rssi} dBm</Text>
              <Text style={styles.label}>Services</Text>
              {services.map(service => (
                <View key={service.uuid} style={styles.service}>
                  <Text style={styles.value}>{service.uuid}</Text>
                  <Text style={styles.small}>{service.primary ? 'Primary' : 'Secondary'}</Text>
                </View>
              ))}
              <Text style={styles.label}>Characteristics</Text>
              {characteristics.map(item => (
                <View key={item.service} style={styles.service}>
                  <Text style={styles.small}>Service: {item.service}</Text>
                  {item.characteristics.map(characteristic => (
                    <Text key={characteristic.uuid} style={styles.value}>
                      {characteristic.uuid}{'\n'}Properties: {characteristic.properties}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.empty}>Select a Bluetooth device.</Text>
          )}
        </View>

        <View style={styles.logPanel}>
          <Text style={styles.sectionTitle}>Event Log</Text>
          <ScrollView>{events.map((event, index) => <Text key={index} style={styles.log}>{event}</Text>)}</ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#101114'},
  header: {
    height: 80,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#2b2d33',
  },
  title: {color: 'white', fontSize: 24, fontWeight: '700'},
  status: {color: '#999', marginTop: 4},
  scanButton: {paddingHorizontal: 22, paddingVertical: 11, borderRadius: 8, backgroundColor: '#2878ff'},
  buttonText: {color: 'white', fontWeight: '600'},
  content: {flex: 1, flexDirection: 'row'},
  devicePanel: {width: 340, padding: 20, borderRightWidth: 1, borderRightColor: '#2b2d33'},
  inspector: {flex: 1, padding: 20},
  logPanel: {width: 320, padding: 20, borderLeftWidth: 1, borderLeftColor: '#2b2d33'},
  sectionTitle: {color: 'white', fontSize: 17, fontWeight: '700', marginBottom: 16},
  device: {padding: 14, marginBottom: 8, borderRadius: 8, backgroundColor: '#1b1d22', flexDirection: 'row', alignItems: 'center'},
  selected: {borderWidth: 1, borderColor: '#2878ff'},
  deviceDetails: {flex: 1},
  deviceName: {color: 'white', fontSize: 15, fontWeight: '600'},
  deviceId: {color: '#777', fontSize: 10, marginTop: 4},
  rssi: {color: '#aaa', fontSize: 11, marginTop: 5},
  connection: {color: '#5ca7ff', fontSize: 11},
  label: {color: '#888', fontSize: 12, marginTop: 14},
  value: {color: 'white', fontSize: 13, marginTop: 4},
  small: {color: '#777', fontSize: 11, marginTop: 3},
  service: {backgroundColor: '#191b20', padding: 10, marginTop: 7, borderRadius: 6},
  empty: {color: '#777', marginTop: 20},
  log: {color: '#aaa', fontSize: 11, marginBottom: 7},
});
