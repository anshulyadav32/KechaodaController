import React, {useCallback, useEffect, useState} from 'react';
import {NativeEventEmitter, NativeModules, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

type Log = {type: 'TX' | 'RX' | 'SYSTEM'; text: string; time: string};
type Device = {model: string; firmware: string; signal: string; operator: string; charset: string};
type USBModule = {listPorts: () => Promise<string[]>; connect: (port: string) => Promise<boolean>; disconnect: () => void; send: (command: string) => Promise<boolean>; exitApp?: () => void; addListener: (eventName: string) => void; removeListeners: (count: number) => void};

const usb = NativeModules.KechaodaUSB as USBModule | undefined;
const usbEvents = usb ? new NativeEventEmitter(usb) : null;

export default function App() {
  const [ports, setPorts] = useState<string[]>([]);
  const [port, setPort] = useState('/dev/cu.usbmodem1100');
  const [connected, setConnected] = useState(false);
  const [command, setCommand] = useState('AT');
  const [logs, setLogs] = useState<Log[]>([]);
  const [device, setDevice] = useState<Device>({model: 'Unknown', firmware: 'Unknown', signal: 'Unknown', operator: 'Unknown', charset: 'Unknown'});

  const addLog = useCallback((type: Log['type'], text: string) => setLogs(previous => [...previous.slice(-500), {type, text, time: new Date().toLocaleTimeString()}]), []);

  const parseResponse = useCallback((data: string) => {
    const update = (key: keyof Device, pattern: RegExp) => { const match = data.match(pattern); if (match) setDevice(previous => ({...previous, [key]: match[1].replace(/\r/g, '').trim()})); };
    update('model', /\+CGMM:\s*(.+)/);
    update('firmware', /\+CGMR:\s*(.+)/);
    update('signal', /\+CSQ:\s*([0-9]+\s*,\s*[0-9]+)/);
    update('operator', /\+COPS:\s*[^,]+,[^,]+,"([^"]+)"/);
    update('charset', /\+CSCS:\s*"([^"]+)"/);
  }, []);

  const sendCommand = useCallback(async (value = command) => {
    const trimmed = value.trim();
    if (!usb || !trimmed) return;
    addLog('TX', trimmed);
    try { await usb.send(trimmed); } catch (error) { addLog('SYSTEM', String(error)); }
  }, [addLog, command]);

  const scanPorts = useCallback(async () => {
    if (!usb) return;
    try { const result = await usb.listPorts(); setPorts(result); if (result.length > 0) setPort(current => result.includes(current) ? current : result[0]); }
    catch (error) { addLog('SYSTEM', String(error)); }
  }, [addLog]);

  async function connect() {
    if (!usb) return;
    addLog('SYSTEM', `Connecting to ${port}`);
    try { await usb.connect(port); } catch (error) { addLog('SYSTEM', String(error)); }
  }

  function disconnect() { usb?.disconnect(); }

  function exitApp() { usb?.exitApp?.(); }

  const initializeDevice = useCallback(() => {
    ['AT', 'AT+CGMM', 'AT+CGMR', 'AT+CSQ', 'AT+COPS?', 'AT+CSCS?', 'AT+CLCC', 'AT+CMEE?', 'AT+CCWA?', 'AT+CLIP?'].forEach((value, index) => setTimeout(() => void sendCommand(value), 100 + index * 800));
  }, [sendCommand]);

  useEffect(() => {
    if (!usb || !usbEvents) {
      addLog('SYSTEM', 'KECHAODA USB native module is unavailable');
      return;
    }
    void scanPorts();
    const subscriptions = [
      usbEvents.addListener('KechaodaData', event => { const data = String(event.data || ''); addLog('RX', data); parseResponse(data); }),
      usbEvents.addListener('KechaodaConnected', event => { setConnected(true); addLog('SYSTEM', `Connected: ${event.port}`); initializeDevice(); }),
      usbEvents.addListener('KechaodaDisconnected', () => { setConnected(false); addLog('SYSTEM', 'Disconnected'); }),
      usbEvents.addListener('KechaodaError', event => addLog('SYSTEM', event?.message || 'USB error')),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, [addLog, initializeDevice, parseResponse, scanPorts]);

  return <SafeAreaView style={styles.container}>
    <View style={styles.header}><Text style={styles.title}>KECHAODA Controller</Text><View style={styles.headerActions}><View style={[styles.status, {backgroundColor: connected ? '#198754' : '#666'}]}><Text style={styles.statusText}>{connected ? 'CONNECTED' : 'DISCONNECTED'}</Text></View><Button title="Exit" onPress={exitApp} /></View></View>
    <ScrollView style={styles.content}>
      <Section title="USB Device"><Text style={styles.label}>Serial Port</Text><View style={styles.row}><TextInput value={port} onChangeText={setPort} style={[styles.input, styles.flexInput]} /><Button title="Scan" onPress={() => void scanPorts()} /></View>{ports.map(item => <TouchableOpacity key={item} style={styles.port} onPress={() => setPort(item)}><Text style={styles.portText}>{item}</Text></TouchableOpacity>)}<View style={styles.row}><Button title="Connect" onPress={() => void connect()} /><Button title="Disconnect" onPress={disconnect} /></View></Section>
      <Section title="Device Inspector"><Info label="Model" value={device.model} /><Info label="Firmware" value={device.firmware} /><Info label="Signal" value={device.signal} /><Info label="Operator" value={device.operator} /><Info label="Character Set" value={device.charset} /></Section>
      <Section title="Quick Commands"><View style={styles.commandGrid}>{['AT', 'AT+CSQ', 'AT+COPS?', 'AT+CGMM', 'AT+CGMR', 'AT+CLCC', 'AT+CCWA?', 'AT+CLIP?', 'AT+CMEE?', 'AT+CHUP'].map(value => <Button key={value} title={value} onPress={() => void sendCommand(value)} />)}</View></Section>
      <Section title="AT Terminal"><View style={styles.row}><TextInput value={command} onChangeText={setCommand} onSubmitEditing={() => void sendCommand()} style={[styles.input, styles.flexInput]} placeholder="AT command" placeholderTextColor="#777" /><Button title="Send" onPress={() => void sendCommand()} /></View></Section>
      <Section title="USB Log"><View style={styles.log}>{logs.map((item, index) => <Text key={`${item.time}-${index}`} style={[styles.logLine, item.type === 'TX' ? styles.tx : item.type === 'RX' ? styles.rx : styles.system]}>[{item.time}] {item.type}: {item.text}</Text>)}</View></Section>
    </ScrollView>
  </SafeAreaView>;
}

function Section({title, children}: {title: string; children: React.ReactNode}) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Info({label, value}: {label: string; value: string}) { return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }
function Button({title, onPress}: {title: string; onPress: () => void}) { return <TouchableOpacity style={styles.button} onPress={onPress}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#101114'}, header: {height: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#303238'}, headerActions: {flexDirection: 'row', alignItems: 'center', gap: 10}, title: {fontSize: 22, fontWeight: '700', color: '#fff'}, status: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6}, statusText: {color: '#fff', fontSize: 12, fontWeight: '700'}, content: {flex: 1, padding: 20}, section: {marginBottom: 20, padding: 16, backgroundColor: '#191b20', borderRadius: 10, borderWidth: 1, borderColor: '#2b2e35'}, sectionTitle: {color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 14}, label: {color: '#aaa', marginBottom: 6}, row: {flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10}, input: {minHeight: 38, paddingHorizontal: 10, backgroundColor: '#0d0e11', borderColor: '#3a3d45', borderWidth: 1, borderRadius: 6, color: '#fff'}, flexInput: {flex: 1}, button: {minHeight: 38, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2e6ee6', borderRadius: 6, marginRight: 6, marginBottom: 6}, buttonText: {color: '#fff', fontWeight: '600'}, port: {padding: 10, backgroundColor: '#22252b', borderRadius: 5, marginBottom: 6}, portText: {color: '#ddd', fontFamily: 'Menlo'}, commandGrid: {flexDirection: 'row', flexWrap: 'wrap'}, info: {flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#292c32'}, infoLabel: {width: 130, color: '#999'}, infoValue: {flex: 1, color: '#fff'}, log: {backgroundColor: '#08090b', padding: 12, borderRadius: 6, minHeight: 200}, logLine: {fontFamily: 'Menlo', fontSize: 12, marginBottom: 4}, tx: {color: '#65a9ff'}, rx: {color: '#69d38b'}, system: {color: '#e4b85c'},
});
