package br.com.beautybrasil.vendas;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WifiInfoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
