package com.marblevalley.game;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Finds other phones on the same Wi-Fi with UDP broadcast beacons, and carries
 * the game's messages between them as single datagrams, which is quick enough for racing.
 */
@CapacitorPlugin(name = "LocalNet")
public class LocalNetPlugin extends Plugin {
    private static final String TAG = "LocalNet";
    private static final int PORT = 47787;
    private static final long BEACON_MS = 2000;
    private static final int MAX_BYTES = 65507;
    // Anything else arriving on this port is not for the game.
    private static final String MESSAGE_START = "{\"app\":\"mv\"";

    private DatagramSocket udp;
    private ExecutorService readers;
    private ExecutorService sender;
    private WifiManager.MulticastLock multicastLock;
    private WifiManager.WifiLock wifiLock;
    private volatile String beacon = null;

    @PluginMethod
    public void start(PluginCall call) {
        try {
            if (udp == null) open();
            JSObject ret = new JSObject();
            ret.put("ip", localIp());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "start failed", e);
            close();
            call.reject("Could not start: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        close();
        call.resolve();
    }

    // What to keep broadcasting so others can find this phone, or nothing if it is not hosting.
    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    public void setBeacon(PluginCall call) {
        beacon = call.getString("data");
    }

    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    public void send(PluginCall call) {
        String ip = call.getString("ip");
        String data = call.getString("data");
        DatagramSocket socket = udp;
        ExecutorService out = sender;
        if (ip == null || data == null || socket == null || out == null) return;
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        out.execute(() -> {
            try {
                socket.send(new DatagramPacket(bytes, bytes.length, InetAddress.getByName(ip), PORT));
            } catch (IOException ignored) {
                // A lost message is normal here, and the next one is coming anyway.
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        close();
    }

    private void open() throws IOException {
        WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            multicastLock = wifi.createMulticastLock("marble-valley");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
            // Without this Wi-Fi naps between packets, and other balls jump around.
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wifi.createWifiLock(mode, "marble-valley");
            wifiLock.setReferenceCounted(false);
            wifiLock.acquire();
        }
        DatagramSocket socket = new DatagramSocket(null);
        socket.setReuseAddress(true);
        socket.setBroadcast(true);
        socket.bind(new InetSocketAddress(PORT));
        udp = socket;
        sender = Executors.newSingleThreadExecutor();
        readers = Executors.newFixedThreadPool(2);
        readers.execute(() -> listen(socket));
        readers.execute(() -> sendBeacons(socket));
    }

    private void close() {
        beacon = null;
        if (udp != null) udp.close();
        udp = null;
        if (readers != null) readers.shutdownNow();
        if (sender != null) sender.shutdownNow();
        readers = null;
        sender = null;
        if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    private void listen(DatagramSocket socket) {
        byte[] buf = new byte[MAX_BYTES];
        while (!socket.isClosed()) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                socket.receive(p);
                String text = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                if (!text.startsWith(MESSAGE_START)) continue;
                JSObject event = new JSObject();
                event.put("ip", p.getAddress().getHostAddress());
                event.put("data", text);
                notifyListeners("message", event);
            } catch (IOException e) {
                if (socket.isClosed()) return;
            }
        }
    }

    private void sendBeacons(DatagramSocket socket) {
        while (!socket.isClosed()) {
            String now = beacon;
            if (now != null) {
                byte[] data = now.getBytes(StandardCharsets.UTF_8);
                for (InetAddress addr : broadcastAddresses()) {
                    try {
                        socket.send(new DatagramPacket(data, data.length, addr, PORT));
                    } catch (IOException ignored) {
                        // That network may have gone; the others may still reach someone.
                    }
                }
            }
            try {
                Thread.sleep(BEACON_MS);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private List<InetAddress> broadcastAddresses() {
        List<InetAddress> list = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null) list.add(ia.getBroadcast());
                }
            }
            list.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignored) {
            // Keep whatever was found.
        }
        return list;
    }

    private String localIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) {
            // No address to show is not a failure.
        }
        return null;
    }
}
