// patient-app/App.js
import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, Text, Button, TextInput, StyleSheet } from 'react-native';
import AgoraUIKit from 'agora-rn-uikit';
import { io } from 'socket.io-client';

// --- CONFIG ---
const APP_ID = '60bdf4f5f1b641f583d20d28d7a923d1';
const SIGNALING_SERVER = 'https://server-w411.onrender.com'; // <-- REPLACE with your server (LAN IP or ngrok url)
const MY_USER_ID = 'patient';
const CALLEE_ID = 'doctor';

export default function App() {
  const socketRef = useRef(null);
  const [channel, setChannel] = useState('');
  const [callingState, setCallingState] = useState('idle'); // idle, calling, ringing, in-call
  const [joined, setJoined] = useState(false);
  const [token, setToken] = useState(null);
  const [uid, setUid] = useState(null);
  const [log, setLog] = useState('');

  // connect socket and register
  useEffect(() => {
    const socket = io(SIGNALING_SERVER, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('register', { userId: MY_USER_ID });
      appendLog('registered socket');
    });

    socket.on('callee_unavailable', () => {
      appendLog('callee unavailable');
      setCallingState('idle');
    });

    socket.on('call_accepted', (payload) => {
      appendLog('call accepted, joining channel');
      // doctor sent their calleeUid; we (caller) should already have our token/uid
      setCallingState('in-call');
      // join now
      setChannel(payload.channel);
      setJoined(true);
    });

    socket.on('call_rejected', () => {
      appendLog('call rejected');
      setCallingState('idle');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  function appendLog(s) {
    setLog((l) => `${l}\n${s}`);
  }

  async function startCall() {
    setCallingState('calling');
    // generate channel & caller uid, request token for THIS caller
    const channelName = `call_${Date.now()}`;
    const callerUid = Math.floor(Math.random() * 1000000);
    appendLog(`requesting token for channel ${channelName}, uid ${callerUid}`);
    try {
      const resp = await fetch(
        `${SIGNALING_SERVER}/rtcToken?channelName=${encodeURIComponent(channelName)}&uid=${callerUid}`
      );
      const data = await resp.json();
      if (!data.rtcToken) throw new Error(JSON.stringify(data));
      setToken(data.rtcToken);
      setUid(callerUid);
      setChannel(channelName);

      // send call invite to doctor
      socketRef.current.emit('call', {
        to: CALLEE_ID,
        from: MY_USER_ID,
        channel: channelName,
        callerUid,
      });
      appendLog('sent call invite to doctor');
    } catch (err) {
      appendLog('token error: ' + err.toString());
      setCallingState('idle');
    }
  }

  // UI: if joined -> show AgoraUIKit with our token & uid
  if (joined) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <AgoraUIKit
          connectionData={{
            appId: APP_ID,
            channel: channel,
            token: token || undefined,
            uid: uid || undefined,
          }}
          callbacks={{ EndCall: () => {
            setJoined(false);
            setChannel('');
            setToken(null);
            setUid(null);
            setCallingState('idle');
          } }}
        />
      </SafeAreaView>
    );
  }

  // Not in call UI
  return (
    <SafeAreaView style={{ flex: 1, padding: 20 }}>
      <Text style={styles.title}>Patient — Call Doctor</Text>
      <Button title={callingState === 'calling' ? 'Calling...' : 'Call Doctor'} onPress={startCall} disabled={callingState === 'calling'} />
      <Text style={{ marginTop: 12, color: '#666' }}>Channel will be created and doctor will be invited.</Text>
      <View style={{ marginTop: 18 }}>
        <Text style={{ fontWeight: '700' }}>Debug</Text>
        <Text>{`state: ${callingState}`}</Text>
        <Text>{`channel: ${channel}`}</Text>
        <Text>{`uid: ${uid}`}</Text>
        <Text style={{ marginTop: 8, color: '#444' }}>{log}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
});
