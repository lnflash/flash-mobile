package com.dspread.demoui;

import android.app.Application;
import android.content.Context;

import androidx.multidex.MultiDex;

import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.ReactInstanceManager;

import java.util.List;

import xcrash.XCrash;

public class BaseApplication extends Application {
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        //  默认初始化
        XCrash.init(this);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        MultiDex.install(this);
    }
}
