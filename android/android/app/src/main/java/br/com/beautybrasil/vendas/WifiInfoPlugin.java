package br.com.beautybrasil.vendas;

import android.Manifest;
import android.content.Context;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.text.format.Formatter;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "WifiInfo",
    permissions = {
        @Permission(
            alias = "wifi",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_WIFI_STATE
            }
        )
    }
)
public class WifiInfoPlugin extends Plugin {

    @PluginMethod
    public void getNetwork(PluginCall call) {
        if (getPermissionState("wifi") != PermissionState.GRANTED) {
            requestPermissionForAlias("wifi", call, "wifiPerms");
            return;
        }
        respond(call);
    }

    @PermissionCallback
    private void wifiPerms(PluginCall call) {
        respond(call);
    }

    private void respond(PluginCall call) {
        JSObject ret = new JSObject();
        WifiManager wifi = (WifiManager) getContext()
            .getApplicationContext()
            .getSystemService(Context.WIFI_SERVICE);
        if (wifi == null) {
            ret.put("ssid", JSObject.NULL);
            ret.put("ipv4", JSObject.NULL);
            call.resolve(ret);
            return;
        }
        WifiInfo info = wifi.getConnectionInfo();
        String ssid = info.getSSID();
        if (ssid != null) {
            ssid = ssid.replace("\"", "");
            if ("<unknown ssid>".equals(ssid) || "0x".equals(ssid) || ssid.isEmpty()) {
                ssid = null;
            }
        }
        String ipv4 = null;
        int ip = info.getIpAddress();
        if (ip != 0) {
            ipv4 = Formatter.formatIpAddress(ip);
        }
        if (ssid != null) {
            ret.put("ssid", ssid);
        } else {
            ret.put("ssid", JSObject.NULL);
        }
        if (ipv4 != null) {
            ret.put("ipv4", ipv4);
        } else {
            ret.put("ipv4", JSObject.NULL);
        }
        call.resolve(ret);
    }
}
