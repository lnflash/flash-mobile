package com.dspread.demoui;

import android.content.Intent;

import androidx.annotation.NonNull;

import com.dspread.demoui.activities.BluetoothActivity;
import com.dspread.demoui.activities.WelcomeActivity;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class JumpModule extends ReactContextBaseJavaModule {
    public ReactApplicationContext reactApplicationContext;
    public JumpModule(ReactApplicationContext applicationContext){
        super(applicationContext);
        this.reactApplicationContext = applicationContext;
    }

    @NonNull
    @Override
    public String getName() {
        return "JumpModule";
    }

    //表示react native和android有相同module时，返回true表示允许覆盖
    @Override
    public boolean canOverrideExistingModule() {
        return true;
    }

    @ReactMethod
    public void jump(){
        Intent intent=new Intent(getReactApplicationContext(), WelcomeActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        reactApplicationContext.startActivity(intent);
    }
}
