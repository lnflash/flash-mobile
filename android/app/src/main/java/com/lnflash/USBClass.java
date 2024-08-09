package com.dspread.demoui;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;

import com.dspread.demoui.utils.TRACE;

public class USBClass {

	private static UsbManager mManager = null;
	
	private static HashMap<String, UsbDevice> mdevices;
	public static HashMap<String, UsbDevice> getMdevices() {
		return mdevices;
	}

	private static PendingIntent mPermissionIntent;
	private static final String ACTION_USB_PERMISSION = "com.android.example.USB_PERMISSION";
	private final BroadcastReceiver mUsbReceiver = new BroadcastReceiver() {

		public void onReceive(Context context, Intent intent) {
			String action = intent.getAction();
			if (ACTION_USB_PERMISSION.equals(action)) {
				synchronized (this) {
					UsbDevice device = (UsbDevice) intent
							.getParcelableExtra(UsbManager.EXTRA_DEVICE);
					if (intent.getBooleanExtra(
							UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
						if (device != null) {
							// call method to set up device communication
							TRACE.i("usb"+ "permission granted for device "
									+ device);
						}
					} else {
						TRACE.i("usb"+ "permission denied for device " + device);
					}
				}
			}
		}
	};

	@TargetApi(Build.VERSION_CODES.HONEYCOMB_MR1)
	@SuppressLint("NewApi")
	public ArrayList<String> GetUSBDevices(Context context) {
		mManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
		
		mdevices = new HashMap<String, UsbDevice>();
		ArrayList<String> deviceList = new ArrayList<String>();
		mPermissionIntent = PendingIntent.getBroadcast(context, 0, new Intent(
				"com.android.example.USB_PERMISSION"), 0);
		IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
		context.registerReceiver(mUsbReceiver, filter);

		// check for existing devices
		for (UsbDevice device : mManager.getDeviceList().values()) {
			// 判断是否有权限
	        if(!mManager.hasPermission(device) && (device.getVendorId() == 2965 || device.getVendorId() == 0x03EB || device.getVendorId() == 1027)) {
	        	TRACE.d("km  没有权限");
	            // 打开设备，获取 UsbDeviceConnection 对象，连接设备，用于后面的通讯
	        	mManager.requestPermission(device, mPermissionIntent);
	            return null;
	        }
			String deviceName = null;
			UsbDeviceConnection connection = null;
			if (device.getVendorId() == 2965 || device.getVendorId() == 0x03EB
					|| device.getVendorId() == 1027 || device.getVendorId() == 6790 )
			{
				if(!mManager.hasPermission(device)) {
					TRACE.d("km  还没有权限");
					mManager.requestPermission(device, mPermissionIntent);
					return null;
				}
				connection = mManager.openDevice(device);
				byte rawBuf[] = new byte[255];
				int len = connection.controlTransfer(0x80, 0x06, 0x0302,
						0x0409, rawBuf, 0x00FF, 60);
				rawBuf = Arrays.copyOfRange(rawBuf, 2, len);
				deviceName = new String(rawBuf);
				deviceList.add(deviceName);
				mdevices.put(deviceName, device);
			}

		}
		context.unregisterReceiver(mUsbReceiver);
		return deviceList;
	}


//	public int ResumeUsbPermission(Context mContext,UsbManager mUsbmanager) {
//
//		try {
//			PackageManager packageManager = getmContext().getPackageManager();
//			PackageInfo packageInfo = packageManager.getPackageInfo(
//					getmContext().getPackageName(), 0);
//
//
//		mUsbmanager = (UsbManager) mContext
//				.getSystemService(Context.USB_SERVICE);
//		PendingIntent mPendingIntent = PendingIntent.getBroadcast(mContext, 0, new Intent(
//				mString), 0);
//		HashMap<String, UsbDevice> deviceList = mUsbmanager.getDeviceList();
//		if (deviceList.isEmpty()) {
//			Toast.makeText(mContext, "No matching device found",
//					Toast.LENGTH_SHORT).show();
//			return -1;
//		}
//		Iterator<UsbDevice> localIterator = deviceList.values().iterator();
//		while (localIterator.hasNext()) {
//			UsbDevice	localUsbDevice = localIterator.next();
//			for (int i = 0; i < DeviceCount; ++i) {
//				if (String
//						.format("%04x:%04x",
//								new Object[] {
//										Integer.valueOf(localUsbDevice
//												.getVendorId()),
//										Integer.valueOf(localUsbDevice
//												.getProductId()) }).equals(
//								DeviceNum.get(i))) {
//					//BroadcastFlag = true;
//					if (!mUsbmanager.hasPermission(localUsbDevice)) {
///*						Toast.makeText(mContext, "No Perssion!",
//								Toast.LENGTH_SHORT).show();*/
//						synchronized (mUsbReceiver) {
//							mUsbmanager.requestPermission(localUsbDevice,
//									mPendingIntent);
//						}
//						return -2;
//					}
//					return 0;
//				} else {
//					Log.d(TAG, "String.format not match");
//				}
//			}
//		}
//		return -1;
//	}



	
}
