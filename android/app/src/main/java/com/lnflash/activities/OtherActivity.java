package com.dspread.demoui.activities;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.PendingIntent;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.text.TextUtils;
import android.util.Log;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;

import com.dspread.demoui.R;
import com.dspread.demoui.USBClass;
import com.dspread.demoui.keyboard.KeyBoardNumInterface;
import com.dspread.demoui.keyboard.KeyboardUtil;
import com.dspread.demoui.keyboard.MyKeyboardView;
import com.dspread.demoui.utils.DUKPK2009_CBC;
import com.dspread.demoui.utils.QPOSUtil;
import com.dspread.demoui.utils.TRACE;
import com.dspread.xpos.CQPOSService;
import com.dspread.xpos.QPOSService;
import com.dspread.xpos.QPOSService.TransactionType;

import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.LinkedHashMap;
import java.util.List;

import Decoder.BASE64Encoder;

public class OtherActivity extends BaseActivity{

    private Button doTradeButton, serialBtn;
    private Button btn_poweron,btn_sendApdu,btn_poweroff;

    private EditText statusEditText;
    private ListView appListView;

    private Dialog dialog;
    private String nfcLog = "";

    private Button btnUSB;

    private Button btnDisconnect;

    private EditText mKeyIndex;
    private EditText mhipStatus;

    private QPOSService pos;


    private String pubModel;
    private String amount = "";
    private String cashbackAmount = "";
    private boolean isPinCanceled = false;
    private String blueTootchAddress = "";

    private boolean isUart = true;
    private LinearLayout lin;


    private int type;
    private UsbDevice usbDevice;

    private Context mContext;
    private static final int REQUEST_CODE_QRCODE_PERMISSIONS = 1;
    private boolean autoDoTrade = false;


    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        //当窗口为用户可见，保持设备常开，并保持亮度不变
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON, WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (!isUart) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
        mContext = this;
        initView();
        initIntent();
        initListener();
        open(QPOSService.CommunicationMode.UART);
        posType = POS_TYPE.UART;
//                        blueTootchAddress = "/dev/ttyMT0";//同方那边是s1，天波是s3
        blueTootchAddress = "/dev/ttyS1";//同方那边是s1，天波是s3
//                        blueTootchAddress = "/dev/ttyHSL1";//同方那边是s1，天波是s3
        pos.setDeviceAddress(blueTootchAddress);
        pos.openUart();
    }

    @Override
    public void onToolbarLinstener() {
        finish();
    }

    @Override
    protected int getLayoutId() {
        return R.layout.activity_other;
    }

    private void initIntent() {
        Intent intent = getIntent();
        type = intent.getIntExtra("connect_type", 0);
        switch (type) {
            case 1:
                setTitle(getString(R.string.title_audio));
                open(QPOSService.CommunicationMode.AUDIO);
                posType = POS_TYPE.AUDIO;
                pos.openAudio();
                break;
            case 2:
                setTitle(getString(R.string.serial_port));
                serialBtn.setVisibility(View.VISIBLE);
                serialBtn.setOnClickListener(new View.OnClickListener() {

                    @Override
                    public void onClick(View v) {
                        // TODO Auto-generated method stub
                        open(QPOSService.CommunicationMode.UART);
                        posType = POS_TYPE.UART;
//                        blueTootchAddress = "/dev/ttyMT0";//同方那边是s1，天波是s3
                        blueTootchAddress = "/dev/ttyS1";//同方那边是s1，天波是s3
//                        blueTootchAddress = "/dev/ttyHSL1";//同方那边是s1，天波是s3
                        pos.setDeviceAddress(blueTootchAddress);
                        pos.openUart();
                    }
                });
                break;

        }
    }

    private void initView() {
        doTradeButton = (Button) findViewById(R.id.doTradeButton);//开始交易
        serialBtn = (Button) findViewById(R.id.serialPort);
        statusEditText = (EditText) findViewById(R.id.statusEditText);
        btnUSB = (Button) findViewById(R.id.btnUSB);//扫描USB设备
        btnDisconnect = (Button) findViewById(R.id.disconnect);//断开连接
        mKeyIndex = ((EditText) findViewById(R.id.keyindex));
        mhipStatus = (findViewById(R.id.chipStatus));
        lin = findViewById(R.id.lin);
        btn_poweron = findViewById(R.id.btn_poweron);
        btn_sendApdu = findViewById(R.id.btn_sendApdu);
        btn_poweroff = findViewById(R.id.btn_poweroff);
    }

    private void initListener() {
        MyOnClickListener myOnClickListener = new MyOnClickListener();
        //以下是按钮的点击事件
        doTradeButton.setOnClickListener(myOnClickListener);//开始
        btnDisconnect.setOnClickListener(myOnClickListener);
        btnUSB.setOnClickListener(myOnClickListener);
        btn_poweron.setOnClickListener(myOnClickListener);
        btn_sendApdu.setOnClickListener(myOnClickListener);
        btn_poweroff.setOnClickListener(myOnClickListener);
    }
    private POS_TYPE posType = POS_TYPE.BLUETOOTH;

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private enum POS_TYPE {
        BLUETOOTH, AUDIO, UART, USB, OTG, BLUETOOTH_BLE
    }

    /**
     * 打开设备，获取类对象，开始监听
     *
     * @param mode
     */
    private void open(QPOSService.CommunicationMode mode) {
        TRACE.d("open");
        //pos=null;
        MyPosListener listener = new MyPosListener();
        //实现类的单例模式
        pos = QPOSService.getInstance(mode);
        if (pos == null) {
            statusEditText.setText("CommunicationMode unknow");
            return;
        }
        if (mode == QPOSService.CommunicationMode.USB_OTG_CDC_ACM) {
            pos.setUsbSerialDriver(QPOSService.UsbOTGDriver.CH34XU);
        }else if(mode == QPOSService.CommunicationMode.UART){
            pos.setD20Trade(true);
        }

        pos.setConext(this);
        //通过handler处理，监听MyPosListener，实现QposService的接口，（回调接口）
        Handler handler = new Handler(Looper.myLooper());
        pos.initListener(handler, listener);
        String sdkVersion = pos.getSdkVersion();
        Toast.makeText(this, "sdkVersion--" + sdkVersion, Toast.LENGTH_SHORT).show();
    }

    /**
     * 关闭设备
     */
    private void close() {
        TRACE.d("close");
        if (pos == null) {
            return;
        } else if (posType == POS_TYPE.AUDIO) {
            pos.closeAudio();
        } else if (posType == POS_TYPE.BLUETOOTH) {
            pos.disconnectBT();

        } else if (posType == POS_TYPE.BLUETOOTH_BLE) {
            pos.disconnectBLE();
        } else if (posType == POS_TYPE.UART) {
            pos.closeUart();
        } else if (posType == POS_TYPE.USB) {
            pos.closeUsb();
        } else if (posType == POS_TYPE.OTG) {
            pos.closeUsb();
        }
    }

    @Override
    public boolean onPrepareOptionsMenu(Menu menu) {
        // MenuItem audioitem = menu.findItem(R.id.audio_test);
        if (pos != null) {
            if (pos.getAudioControl()) {
                audioitem.setTitle(R.string.audio_open);
            } else {
                audioitem.setTitle(R.string.audio_close);
            }
        } else {
            audioitem.setTitle(R.string.audio_unknow);
        }
        return super.onPrepareOptionsMenu(menu);
    }


    MenuItem audioitem = null;

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.activity_main, menu);
        audioitem = menu.findItem(R.id.audio_test);
        if (pos != null) {
            if (pos.getAudioControl()) {
                audioitem.setTitle("音效控制:打开");
            } else {
                audioitem.setTitle("音效控制:关闭");
            }
        } else {
            audioitem.setTitle("音效控制:点击查看");
        }
        return true;
    }


    /**
     * 菜单栏的点击事件
     */
    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (pos == null) {
            Toast.makeText(getApplicationContext(), "设备未连接", Toast.LENGTH_LONG).show();
            return true;
        } else if (item.getItemId() == R.id.reset_qpos) {
            boolean a = pos.resetPosStatus();
            if (a) {
                statusEditText.setText("pos reset");
            }
        } else if (item.getItemId() == R.id.get_ksn) {
            pos.getKsn();

        } else if (item.getItemId() == R.id.getEncryptData) {
            //获得加密数据
            pos.getEncryptData("70563".getBytes(), "1", "0", 10);
        } else if (item.getItemId() == R.id.addKsn) {
            pos.addKsn("00");
        } else if (item.getItemId() == R.id.doTradeLogOperation) {
            pos.doTradeLogOperation(QPOSService.DoTransactionType.GetAll, 0);
        } else if (item.getItemId() == R.id.get_update_key) {//get the key value
            pos.getUpdateCheckValue();

        } else if (item.getItemId() == R.id.get_device_public_key) {//get the key value

            pos.getDevicePublicKey(5);
        } else if (item.getItemId() == R.id.set_sleepmode_time) {//设置设备睡眠时间
//            0~Integer.MAX_VALUE

            pos.setSleepModeTime(20);//the time is in 10s and 10000s
        } else if (item.getItemId() == R.id.set_shutdowm_time) {
            pos.setShutDownTime(15 * 60);
        }
        //更新ipek
        else if (item.getItemId() == R.id.updateIPEK) {
            int keyIndex = getKeyIndex();
            String ipekGrop = "0" + keyIndex;


            pos.doUpdateIPEKOperation(
                    ipekGrop, "09118012400705E00000", "C22766F7379DD38AA5E1DA8C6AFA75AC", "B2DE27F60A443944",
                    "09118012400705E00000", "C22766F7379DD38AA5E1DA8C6AFA75AC", "B2DE27F60A443944",
                    "09118012400705E00000", "C22766F7379DD38AA5E1DA8C6AFA75AC", "B2DE27F60A443944");
        } else if (item.getItemId() == R.id.getSleepTime) {
            pos.getShutDownTime();
        } else if (item.getItemId() == R.id.getQuickEmvStatus) {
            pos.getQuickEMVStatus(QPOSService.EMVDataOperation.getEmv, "9F061000000000000000000000000000000000");
        } else if (item.getItemId() == R.id.setQuickEmvStatus) {
            pos.setQuickEmvStatus(true);
        } else if (item.getItemId() == R.id.audio_test) {
            if (pos.getAudioControl()) {
                pos.setAudioControl(false);
                item.setTitle("音效控制:关闭");
            } else {
                pos.setAudioControl(true);
                item.setTitle("音效控制:打开");
            }
        } else if (item.getItemId() == R.id.about) {

            statusEditText.setText("SDK版本：" + pos.getSdkVersion());
        } else if (item.getItemId() == R.id.setBuzzer) {
            pos.doSetBuzzerOperation(3);//显示设置蜂鸣器响3次
        } else if (item.getItemId() == R.id.menu_get_deivce_info) {
            statusEditText.setText(R.string.getting_info);
            pos.getQposInfo();

        } else if (item.getItemId() == R.id.menu_get_deivce_key_checkvalue) {
            statusEditText.setText("get_deivce_key_checkvalue..............");
            int keyIdex = getKeyIndex();
            pos.getKeyCheckValue(keyIdex, QPOSService.CHECKVALUE_KEYTYPE.DUKPT_MKSK_ALLTYPE);


        } else if (item.getItemId() == R.id.menu_get_pos_id) {

            pos.getQposId();
            statusEditText.setText(R.string.getting_pos_id);
        } else if (item.getItemId() == R.id.setMasterkey) {
            //key:0123456789ABCDEFFEDCBA9876543210
            //result；0123456789ABCDEFFEDCBA9876543210
            int keyIndex = getKeyIndex();
            pos.setMasterKey("1A4D672DCA6CB3351FD1B02B237AF9AE", "08D7B4FB629D0885", keyIndex);

        } else if (item.getItemId() == R.id.menu_get_pin) {
            statusEditText.setText(R.string.input_pin);
            pos.getPin(1, 0, 6, "please input pin", "622262XXXXXXXXX4406", "", 20);
        } else if (item.getItemId() == R.id.isCardExist) {
            pos.isCardExist(30);
        } else if (item.getItemId() == R.id.resetSessionKey) {


            int keyIndex = getKeyIndex();
            pos.updateWorkKey(
                    "1A4D672DCA6CB3351FD1B02B237AF9AE", "08D7B4FB629D0885",//PIN KEY
                    "1A4D672DCA6CB3351FD1B02B237AF9AE", "08D7B4FB629D0885",  //TRACK KEY
                    "1A4D672DCA6CB3351FD1B02B237AF9AE", "08D7B4FB629D0885", //MAC KEY
                    keyIndex, 5);
        }  else if (item.getItemId() == R.id.cusDisplay) {

            deviceShowDisplay("test info");
        } else if (item.getItemId() == R.id.closeDisplay) {
            pos.lcdShowCloseDisplay();
        }
        return true;
    }




    @Override
    public void onPause() {
        super.onPause();
        TRACE.d("onPause");
    }

    @Override
    public void onResume() {
        super.onResume();
        TRACE.d("onResume");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        TRACE.d("onDestroy");

        if (pos != null) {
            close();
            pos = null;
        }
    }


    public void dismissDialog() {
        if (dialog != null) {
            dialog.dismiss();
            dialog = null;
        }
    }

    private KeyboardUtil keyboardUtil;
    private List<String> keyBoardList = new ArrayList<>();

    /**
     * @author qianmengChen
     * @ClassName: MyPosListener
     * @Function: TODO ADD FUNCTION
     * @date: 2016-11-10 下午6:35:06
     */
    class MyPosListener extends CQPOSService {

        @Override
        public void onQposRequestPinResult(List<String> dataList, int offlineTime) {
            super.onQposRequestPinResult(dataList, offlineTime);
            keyBoardList = dataList;
            MyKeyboardView.setKeyBoardListener(new KeyBoardNumInterface() {
                @Override
                public void getNumberValue(String value) {
//                    statusEditText.setText("Pls click "+dataList.get(0));
                    pos.pinMapSync(value,20);
                }
            });
            keyboardUtil = new KeyboardUtil(OtherActivity.this, lin,dataList);
            keyboardUtil.initKeyboard(MyKeyboardView.KEYBOARDTYPE_Only_Num_Pwd, statusEditText);//随机键盘
        }

        @Override
        public void onReturnGetKeyBoardInputResult(String result) {
            super.onReturnGetKeyBoardInputResult(result);
            mhipStatus.setText(result);
        }

        @Override
        public void onReturnGetPinInputResult(int num) {
            super.onReturnGetPinInputResult(num);
            String s = "";
            if(num == -1){
                if(keyboardUtil != null) {
                    keyboardUtil.hide();
                }
            }else{
                for(int i = 0 ; i <num ; i ++){
                    s += "*";
                }
                statusEditText.setText("result is ：" +s);
            }
        }

        @Override
        public void onRequestWaitingUser() {//等待卡片
            TRACE.d("onRequestWaitingUser()");
            dismissDialog();
            statusEditText.setText(getString(R.string.waiting_for_card));
        }

        /**
         * 返回选择的开始，返回交易的结果
         */
        @Override
        public void onDoTradeResult(QPOSService.DoTradeResult result, Hashtable<String, String> decodeData) {
            TRACE.d("(DoTradeResult result, Hashtable<String, String> decodeData) " + result.toString() + TRACE.NEW_LINE + "decodeData:" + decodeData);
            dismissDialog();

            if (result == QPOSService.DoTradeResult.NONE) {
                statusEditText.setText(getString(R.string.no_card_detected));
            } else if (result == QPOSService.DoTradeResult.ICC) {
                statusEditText.setText(getString(R.string.icc_card_inserted));
                TRACE.d("EMV ICC Start");
                pos.doEmvApp(QPOSService.EmvOption.START);
            } else if (result == QPOSService.DoTradeResult.NOT_ICC) {
                statusEditText.setText(getString(R.string.card_inserted));
            } else if (result == QPOSService.DoTradeResult.BAD_SWIPE) {
                statusEditText.setText(getString(R.string.bad_swipe));
            } else if (result == QPOSService.DoTradeResult.MCR) {//磁条卡
                String content = getString(R.string.card_swiped);
                String formatID = decodeData.get("formatID");
                if (formatID.equals("31") || formatID.equals("40") || formatID.equals("37") || formatID.equals("17") || formatID.equals("11") || formatID.equals("10")) {
                    String maskedPAN = decodeData.get("maskedPAN");
                    String expiryDate = decodeData.get("expiryDate");
                    String cardHolderName = decodeData.get("cardholderName");
                    String serviceCode = decodeData.get("serviceCode");
                    String trackblock = decodeData.get("trackblock");
                    String psamId = decodeData.get("psamId");
                    String posId = decodeData.get("posId");
                    String pinblock = decodeData.get("pinblock");
                    String macblock = decodeData.get("macblock");
                    String activateCode = decodeData.get("activateCode");
                    String trackRandomNumber = decodeData.get("trackRandomNumber");

                    content += getString(R.string.format_id) + " " + formatID + "\n";
                    content += getString(R.string.masked_pan) + " " + maskedPAN + "\n";
                    content += getString(R.string.expiry_date) + " " + expiryDate + "\n";
                    content += getString(R.string.cardholder_name) + " " + cardHolderName + "\n";

                    content += getString(R.string.service_code) + " " + serviceCode + "\n";
                    content += "trackblock: " + trackblock + "\n";
                    content += "psamId: " + psamId + "\n";
                    content += "posId: " + posId + "\n";
                    content += getString(R.string.pinBlock) + " " + pinblock + "\n";
                    content += "macblock: " + macblock + "\n";
                    content += "activateCode: " + activateCode + "\n";
                    content += "trackRandomNumber: " + trackRandomNumber + "\n";
                } else if (formatID.equals("FF")) {
                    String type = decodeData.get("type");
                    String encTrack1 = decodeData.get("encTrack1");
                    String encTrack2 = decodeData.get("encTrack2");
                    String encTrack3 = decodeData.get("encTrack3");
                    content += "cardType:" + " " + type + "\n";
                    content += "track_1:" + " " + encTrack1 + "\n";
                    content += "track_2:" + " " + encTrack2 + "\n";
                    content += "track_3:" + " " + encTrack3 + "\n";
                } else {
                    String orderID = decodeData.get("orderId");
                    String maskedPAN = decodeData.get("maskedPAN");
                    String expiryDate = decodeData.get("expiryDate");
                    String cardHolderName = decodeData.get("cardholderName");
//					String ksn = decodeData.get("ksn");
                    String serviceCode = decodeData.get("serviceCode");
                    String track1Length = decodeData.get("track1Length");
                    String track2Length = decodeData.get("track2Length");
                    String track3Length = decodeData.get("track3Length");
                    String encTracks = decodeData.get("encTracks");
                    String encTrack1 = decodeData.get("encTrack1");
                    String encTrack2 = decodeData.get("encTrack2");
                    String encTrack3 = decodeData.get("encTrack3");
                    String partialTrack = decodeData.get("partialTrack");
                    // TODO
                    String pinKsn = decodeData.get("pinKsn");
                    String trackksn = decodeData.get("trackksn");
                    String pinBlock = decodeData.get("pinBlock");
                    String encPAN = decodeData.get("encPAN");
                    String trackRandomNumber = decodeData.get("trackRandomNumber");
                    String pinRandomNumber = decodeData.get("pinRandomNumber");
                    if (orderID != null && !"".equals(orderID)) {
                        content += "orderID:" + orderID;
                    }
                    content += getString(R.string.format_id) + " " + formatID + "\n";
                    content += getString(R.string.masked_pan) + " " + maskedPAN + "\n";
                    content += getString(R.string.expiry_date) + " " + expiryDate + "\n";
                    content += getString(R.string.cardholder_name) + " " + cardHolderName + "\n";
//					content += getString(R.string.ksn) + " " + ksn + "\n";
                    content += getString(R.string.pinKsn) + " " + pinKsn + "\n";
                    content += getString(R.string.trackksn) + " " + trackksn + "\n";
                    content += getString(R.string.service_code) + " " + serviceCode + "\n";
                    content += getString(R.string.track_1_length) + " " + track1Length + "\n";
                    content += getString(R.string.track_2_length) + " " + track2Length + "\n";
                    content += getString(R.string.track_3_length) + " " + track3Length + "\n";
                    content += getString(R.string.encrypted_tracks) + " " + encTracks + "\n";
                    content += getString(R.string.encrypted_track_1) + " " + encTrack1 + "\n";
                    content += getString(R.string.encrypted_track_2) + " " + encTrack2 + "\n";
                    content += getString(R.string.encrypted_track_3) + " " + encTrack3 + "\n";
                    content += getString(R.string.partial_track) + " " + partialTrack + "\n";
                    content += getString(R.string.pinBlock) + " " + pinBlock + "\n";
                    content += "encPAN: " + encPAN + "\n";
                    content += "trackRandomNumber: " + trackRandomNumber + "\n";
                    content += "pinRandomNumber:" + " " + pinRandomNumber + "\n";
                    String realPan = null;
                    if (!TextUtils.isEmpty(trackksn) && !TextUtils.isEmpty(encTrack2)) {
                        String clearPan = DUKPK2009_CBC.getDate(trackksn, encTrack2, DUKPK2009_CBC.Enum_key.DATA, DUKPK2009_CBC.Enum_mode.CBC);
                        content += "encTrack2:" + " " + clearPan + "\n";
                        realPan = clearPan.substring(0, maskedPAN.length());
                        content += "realPan:" + " " + realPan + "\n";
                    }
                    if (!TextUtils.isEmpty(pinKsn) && !TextUtils.isEmpty(pinBlock) && !TextUtils.isEmpty(realPan)) {
                        String date = DUKPK2009_CBC.getDate(pinKsn, pinBlock, DUKPK2009_CBC.Enum_key.PIN, DUKPK2009_CBC.Enum_mode.CBC);
                        String parsCarN = "0000" + realPan.substring(realPan.length() - 13, realPan.length() - 1);
                        String s = DUKPK2009_CBC.xor(parsCarN, date);
                        content += "PIN:" + " " + s + "\n";
                    }
                }

                statusEditText.setText(content);
//                autoDoTrade(0);

            } else if ((result == QPOSService.DoTradeResult.NFC_ONLINE) || (result == QPOSService.DoTradeResult.NFC_OFFLINE)) {
                nfcLog = decodeData.get("nfcLog");
                String content = getString(R.string.tap_card);
                String formatID = decodeData.get("formatID");
                if (formatID.equals("31") || formatID.equals("40")
                        || formatID.equals("37") || formatID.equals("17")
                        || formatID.equals("11") || formatID.equals("10")) {
                    String maskedPAN = decodeData.get("maskedPAN");
                    String expiryDate = decodeData.get("expiryDate");
                    String cardHolderName = decodeData.get("cardholderName");
                    String serviceCode = decodeData.get("serviceCode");
                    String trackblock = decodeData.get("trackblock");
                    String psamId = decodeData.get("psamId");
                    String posId = decodeData.get("posId");
                    String pinblock = decodeData.get("pinblock");
                    String macblock = decodeData.get("macblock");
                    String activateCode = decodeData.get("activateCode");
                    String trackRandomNumber = decodeData
                            .get("trackRandomNumber");

                    content += getString(R.string.format_id) + " " + formatID
                            + "\n";
                    content += getString(R.string.masked_pan) + " " + maskedPAN
                            + "\n";
                    content += getString(R.string.expiry_date) + " "
                            + expiryDate + "\n";
                    content += getString(R.string.cardholder_name) + " "
                            + cardHolderName + "\n";

                    content += getString(R.string.service_code) + " "
                            + serviceCode + "\n";
                    content += "trackblock: " + trackblock + "\n";
                    content += "psamId: " + psamId + "\n";
                    content += "posId: " + posId + "\n";
                    content += getString(R.string.pinBlock) + " " + pinblock
                            + "\n";
                    content += "macblock: " + macblock + "\n";
                    content += "activateCode: " + activateCode + "\n";
                    content += "trackRandomNumber: " + trackRandomNumber + "\n";
                } else {

                    String maskedPAN = decodeData.get("maskedPAN");
                    String expiryDate = decodeData.get("expiryDate");
                    String cardHolderName = decodeData.get("cardholderName");
//					String ksn = decodeData.get("ksn");
                    String serviceCode = decodeData.get("serviceCode");
                    String track1Length = decodeData.get("track1Length");
                    String track2Length = decodeData.get("track2Length");
                    String track3Length = decodeData.get("track3Length");
                    String encTracks = decodeData.get("encTracks");
                    String encTrack1 = decodeData.get("encTrack1");
                    String encTrack2 = decodeData.get("encTrack2");
                    String encTrack3 = decodeData.get("encTrack3");
                    String partialTrack = decodeData.get("partialTrack");
                    // TODO
                    String pinKsn = decodeData.get("pinKsn");
                    String trackksn = decodeData.get("trackksn");
                    String pinBlock = decodeData.get("pinBlock");
                    String encPAN = decodeData.get("encPAN");
                    String trackRandomNumber = decodeData
                            .get("trackRandomNumber");
                    String pinRandomNumber = decodeData.get("pinRandomNumber");

                    content += getString(R.string.format_id) + " " + formatID
                            + "\n";
                    content += getString(R.string.masked_pan) + " " + maskedPAN
                            + "\n";
                    content += getString(R.string.expiry_date) + " "
                            + expiryDate + "\n";
                    content += getString(R.string.cardholder_name) + " "
                            + cardHolderName + "\n";
//					content += getString(R.string.ksn) + " " + ksn + "\n";
                    content += getString(R.string.pinKsn) + " " + pinKsn + "\n";
                    content += getString(R.string.trackksn) + " " + trackksn
                            + "\n";
                    content += getString(R.string.service_code) + " "
                            + serviceCode + "\n";
                    content += getString(R.string.track_1_length) + " "
                            + track1Length + "\n";
                    content += getString(R.string.track_2_length) + " "
                            + track2Length + "\n";
                    content += getString(R.string.track_3_length) + " "
                            + track3Length + "\n";
                    content += getString(R.string.encrypted_tracks) + " "
                            + encTracks + "\n";
                    content += getString(R.string.encrypted_track_1) + " "
                            + encTrack1 + "\n";
                    content += getString(R.string.encrypted_track_2) + " "
                            + encTrack2 + "\n";
                    content += getString(R.string.encrypted_track_3) + " "
                            + encTrack3 + "\n";
                    content += getString(R.string.partial_track) + " "
                            + partialTrack + "\n";
                    content += getString(R.string.pinBlock) + " " + pinBlock
                            + "\n";
                    content += "encPAN: " + encPAN + "\n";
                    content += "trackRandomNumber: " + trackRandomNumber + "\n";
                    content += "pinRandomNumber:" + " " + pinRandomNumber
                            + "\n";
                }
                statusEditText.setText(content);
                sendMsg(8003);
            } else if ((result == QPOSService.DoTradeResult.NFC_DECLINED)) {
                statusEditText.setText(getString(R.string.transaction_declined));
            } else if (result == QPOSService.DoTradeResult.NO_RESPONSE) {
                statusEditText.setText(getString(R.string.card_no_response));
            }

        }

        @Override
        public void onQposInfoResult(Hashtable<String, String> posInfoData) {
            TRACE.d("onQposInfoResult" + posInfoData.toString());
            String isSupportedTrack1 = posInfoData.get("isSupportedTrack1") == null ? "" : posInfoData.get("isSupportedTrack1");
            String isSupportedTrack2 = posInfoData.get("isSupportedTrack2") == null ? "" : posInfoData.get("isSupportedTrack2");
            String isSupportedTrack3 = posInfoData.get("isSupportedTrack3") == null ? "" : posInfoData.get("isSupportedTrack3");
            String bootloaderVersion = posInfoData.get("bootloaderVersion") == null ? "" : posInfoData.get("bootloaderVersion");
            String firmwareVersion = posInfoData.get("firmwareVersion") == null ? "" : posInfoData.get("firmwareVersion");
            String isUsbConnected = posInfoData.get("isUsbConnected") == null ? "" : posInfoData.get("isUsbConnected");
            String isCharging = posInfoData.get("isCharging") == null ? "" : posInfoData.get("isCharging");
            String batteryLevel = posInfoData.get("batteryLevel") == null ? "" : posInfoData.get("batteryLevel");
            String batteryPercentage = posInfoData.get("batteryPercentage") == null ? ""
                    : posInfoData.get("batteryPercentage");
            String hardwareVersion = posInfoData.get("hardwareVersion") == null ? "" : posInfoData.get("hardwareVersion");
            String SUB = posInfoData.get("SUB") == null ? "" : posInfoData.get("SUB");
            String pciFirmwareVersion = posInfoData.get("PCI_firmwareVersion") == null ? ""
                    : posInfoData.get("PCI_firmwareVersion");
            String pciHardwareVersion = posInfoData.get("PCI_hardwareVersion") == null ? ""
                    : posInfoData.get("PCI_hardwareVersion");
            String content = "";
            content += getString(R.string.bootloader_version) + bootloaderVersion + "\n";
            content += getString(R.string.firmware_version) + firmwareVersion + "\n";
            content += getString(R.string.usb) + isUsbConnected + "\n";
            content += getString(R.string.charge) + isCharging + "\n";
//			if (batteryPercentage==null || "".equals(batteryPercentage)) {
            content += getString(R.string.battery_level) + batteryLevel + "\n";
//			}else {
            content += getString(R.string.battery_percentage) + batteryPercentage + "\n";
//			}
            content += getString(R.string.hardware_version) + hardwareVersion + "\n";
            content += "SUB : " + SUB + "\n";
            content += getString(R.string.track_1_supported) + isSupportedTrack1 + "\n";
            content += getString(R.string.track_2_supported) + isSupportedTrack2 + "\n";
            content += getString(R.string.track_3_supported) + isSupportedTrack3 + "\n";
            content += "PCI FirmwareVresion:" + pciFirmwareVersion + "\n";
            content += "PCI HardwareVersion:" + pciHardwareVersion + "\n";
            statusEditText.setText(content);
        }

        /**
         * 请求交易
         * TODO 简单描述该方法的实现功能（可选）
         *
         * @see com.dspread.xpos.QPOSService.QPOSServiceListener#onRequestTransactionResult(com.dspread.xpos.QPOSService.TransactionResult)
         */
        @Override
        public void onRequestTransactionResult(QPOSService.TransactionResult transactionResult) {
            TRACE.d("onRequestTransactionResult()" + transactionResult.toString());
            if (transactionResult == QPOSService.TransactionResult.CARD_REMOVED) {
                clearDisplay();
            }

            dismissDialog();

            dialog = new Dialog(mContext);
            dialog.setContentView(R.layout.alert_dialog);
            dialog.setTitle(R.string.transaction_result);
            TextView messageTextView = (TextView) dialog.findViewById(R.id.messageTextView);

            if (transactionResult == QPOSService.TransactionResult.APPROVED) {
                TRACE.d("TransactionResult.APPROVED");
                String message = getString(R.string.transaction_approved) + "\n" + getString(R.string.amount) + ": $" + amount + "\n";
                if (!cashbackAmount.equals("")) {
                    message += getString(R.string.cashback_amount) + ": INR" + cashbackAmount;
                }
                messageTextView.setText(message);


            } else if (transactionResult == QPOSService.TransactionResult.TERMINATED) {
                clearDisplay();
                messageTextView.setText(getString(R.string.transaction_terminated));
            } else if (transactionResult == QPOSService.TransactionResult.DECLINED) {
                messageTextView.setText(getString(R.string.transaction_declined));

            } else if (transactionResult == QPOSService.TransactionResult.CANCEL) {
                clearDisplay();
                messageTextView.setText(getString(R.string.transaction_cancel));

            } else if (transactionResult == QPOSService.TransactionResult.CAPK_FAIL) {
                messageTextView.setText(getString(R.string.transaction_capk_fail));
            } else if (transactionResult == QPOSService.TransactionResult.NOT_ICC) {
                messageTextView.setText(getString(R.string.transaction_not_icc));
            } else if (transactionResult == QPOSService.TransactionResult.SELECT_APP_FAIL) {
                messageTextView.setText(getString(R.string.transaction_app_fail));
            } else if (transactionResult == QPOSService.TransactionResult.DEVICE_ERROR) {
                messageTextView.setText(getString(R.string.transaction_device_error));
            } else if (transactionResult == QPOSService.TransactionResult.TRADE_LOG_FULL) {
                statusEditText.setText("pls clear the trace log and then to begin do trade");
                messageTextView.setText("the trade log has fulled!pls clear the trade log!");
            } else if (transactionResult == QPOSService.TransactionResult.CARD_NOT_SUPPORTED) {
                messageTextView.setText(getString(R.string.card_not_supported));
            } else if (transactionResult == QPOSService.TransactionResult.MISSING_MANDATORY_DATA) {
                messageTextView.setText(getString(R.string.missing_mandatory_data));
            } else if (transactionResult == QPOSService.TransactionResult.CARD_BLOCKED_OR_NO_EMV_APPS) {
                messageTextView.setText(getString(R.string.card_blocked_or_no_evm_apps));
            } else if (transactionResult == QPOSService.TransactionResult.INVALID_ICC_DATA) {
                messageTextView.setText(getString(R.string.invalid_icc_data));
            } else if (transactionResult == QPOSService.TransactionResult.FALLBACK) {
                messageTextView.setText("trans fallback");
            } else if (transactionResult == QPOSService.TransactionResult.NFC_TERMINATED) {
                clearDisplay();
                messageTextView.setText("NFC Terminated");
            } else if (transactionResult == QPOSService.TransactionResult.CARD_REMOVED) {
                clearDisplay();
                messageTextView.setText("CARD REMOVED");
            }


            dialog.findViewById(R.id.confirmButton).setOnClickListener(new View.OnClickListener() {

                @Override
                public void onClick(View v) {
                    dismissDialog();
                }
            });

            dialog.show();
            amount = "";
            cashbackAmount = "";

        }

        @Override
        public void onRequestBatchData(String tlv) {
            TRACE.d("ICC交易结束");
            String content = getString(R.string.batch_data);
            TRACE.d("onRequestBatchData(String tlv):" + tlv);
            content += tlv;
            statusEditText.setText(content);
//            autoDoTrade(0);
        }

        @Override
        public void onRequestTransactionLog(String tlv) {
            TRACE.d("onRequestTransactionLog(String tlv):" + tlv);

            dismissDialog();
            String content = getString(R.string.transaction_log);
            content += tlv;
            statusEditText.setText(content);
        }

        @Override
        public void onQposIdResult(Hashtable<String, String> posIdTable) {
            TRACE.w("onQposIdResult():" + posIdTable.toString());
            String posId = posIdTable.get("posId") == null ? "" : posIdTable.get("posId");
            String csn = posIdTable.get("csn") == null ? "" : posIdTable.get("csn");
            String psamId = posIdTable.get("psamId") == null ? "" : posIdTable
                    .get("psamId");
            String NFCId = posIdTable.get("nfcID") == null ? "" : posIdTable
                    .get("nfcID");
            String content = "";
            content += getString(R.string.posId) + posId + "\n";
            content += "csn: " + csn + "\n";
            content += "conn: " + pos.getBluetoothState() + "\n";
            content += "psamId: " + psamId + "\n";
            content += "NFCId: " + NFCId + "\n";
            statusEditText.setText(content);

        }

        @Override
        public void onRequestSelectEmvApp(ArrayList<String> appList) {
            TRACE.d("onRequestSelectEmvApp():" + appList.toString());
            TRACE.d("请选择App -- S，emv卡片的多种配置");
            dismissDialog();
            dialog = new Dialog(mContext);
            dialog.setContentView(R.layout.emv_app_dialog);
            dialog.setTitle(R.string.please_select_app);

            String[] appNameList = new String[appList.size()];
            for (int i = 0; i < appNameList.length; ++i) {

                appNameList[i] = appList.get(i);
            }

            appListView = (ListView) dialog.findViewById(R.id.appList);
            appListView.setAdapter(new ArrayAdapter<String>(mContext, android.R.layout.simple_list_item_1, appNameList));
            appListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {

                @Override
                public void onItemClick(AdapterView<?> parent, View view, int position, long id) {

                    pos.selectEmvApp(position);
                    TRACE.d("请选择App -- 结束 position = " + position);
                    dismissDialog();
                }

            });
            dialog.findViewById(R.id.cancelButton).setOnClickListener(new View.OnClickListener() {

                @Override
                public void onClick(View v) {
                    pos.cancelSelectEmvApp();
                    dismissDialog();
                }
            });
            dialog.show();

        }

        @Override
        public void onRequestSetAmount() {
            TRACE.d("输入金额 -- S");
            TRACE.d("onRequestSetAmount()");


            dismissDialog();
            dialog = new Dialog(mContext);
            dialog.setContentView(R.layout.amount_dialog);
            dialog.setTitle(getString(R.string.set_amount));

            String[] transactionTypes = new String[]{"GOODS", "SERVICES", "CASH", "CASHBACK", "INQUIRY",
                    "TRANSFER", "ADMIN", "CASHDEPOSIT",
                    "PAYMENT", "PBOCLOG||ECQ_INQUIRE_LOG", "SALE",
                    "PREAUTH", "ECQ_DESIGNATED_LOAD", "ECQ_UNDESIGNATED_LOAD",
                    "ECQ_CASH_LOAD", "ECQ_CASH_LOAD_VOID", "CHANGE_PIN", "REFOUND", "SALES_NEW"};
            ((Spinner) dialog.findViewById(R.id.transactionTypeSpinner)).setAdapter(new ArrayAdapter<String>(mContext, android.R.layout.simple_spinner_item,
                    transactionTypes));

            dialog.findViewById(R.id.setButton).setOnClickListener(new View.OnClickListener() {


                @Override
                public void onClick(View v) {

                    String amount = ((EditText) (dialog.findViewById(R.id.amountEditText))).getText().toString();
                    String cashbackAmount = ((EditText) (dialog.findViewById(R.id.cashbackAmountEditText))).getText().toString();
                    String transactionTypeString = (String) ((Spinner) dialog.findViewById(R.id.transactionTypeSpinner)).getSelectedItem();

                    TransactionType transactionType = null;
                    if (transactionTypeString.equals("GOODS")) {
                        transactionType = QPOSService.TransactionType.GOODS;
                    } else if (transactionTypeString.equals("SERVICES")) {
                        transactionType = QPOSService.TransactionType.SERVICES;
                    } else if (transactionTypeString.equals("CASH")) {
                        transactionType = QPOSService.TransactionType.CASH;
                    } else if (transactionTypeString.equals("CASHBACK")) {
                        transactionType = QPOSService.TransactionType.CASHBACK;
                    } else if (transactionTypeString.equals("INQUIRY")) {
                        transactionType = QPOSService.TransactionType.INQUIRY;
                    } else if (transactionTypeString.equals("TRANSFER")) {
                        transactionType = QPOSService.TransactionType.TRANSFER;
                    } else if (transactionTypeString.equals("ADMIN")) {
                        transactionType = QPOSService.TransactionType.ADMIN;
                    } else if (transactionTypeString.equals("CASHDEPOSIT")) {
                        transactionType = QPOSService.TransactionType.CASHDEPOSIT;
                    } else if (transactionTypeString.equals("PAYMENT")) {
                        transactionType = QPOSService.TransactionType.PAYMENT;
                    } else if (transactionTypeString.equals("PBOCLOG||ECQ_INQUIRE_LOG")) {
                        transactionType = QPOSService.TransactionType.PBOCLOG;
                    } else if (transactionTypeString.equals("SALE")) {
                        transactionType = QPOSService.TransactionType.SALE;
                    } else if (transactionTypeString.equals("PREAUTH")) {
                        transactionType = QPOSService.TransactionType.PREAUTH;
                    } else if (transactionTypeString.equals("ECQ_DESIGNATED_LOAD")) {
                        transactionType = QPOSService.TransactionType.ECQ_DESIGNATED_LOAD;
                    } else if (transactionTypeString.equals("ECQ_UNDESIGNATED_LOAD")) {
                        transactionType = QPOSService.TransactionType.ECQ_UNDESIGNATED_LOAD;
                    } else if (transactionTypeString.equals("ECQ_CASH_LOAD")) {
                        transactionType = QPOSService.TransactionType.ECQ_CASH_LOAD;
                    } else if (transactionTypeString.equals("ECQ_CASH_LOAD_VOID")) {
                        transactionType = QPOSService.TransactionType.ECQ_CASH_LOAD_VOID;
                    } else if (transactionTypeString.equals("CHANGE_PIN")) {
                        transactionType = QPOSService.TransactionType.UPDATE_PIN;
                    } else if (transactionTypeString.equals("REFOUND")) {
                        transactionType = QPOSService.TransactionType.REFUND;
                    } else if (transactionTypeString.equals("SALES_NEW")) {
                        transactionType = QPOSService.TransactionType.SALES_NEW;
                    }


                    OtherActivity.this.amount = amount;
                    OtherActivity.this.cashbackAmount = cashbackAmount;

                    pos.setAmount(amount, cashbackAmount, "156", transactionType);

                    TRACE.d("输入金额  -- 结束");
                    dismissDialog();
                }

            });

            dialog.findViewById(R.id.cancelButton).setOnClickListener(new View.OnClickListener() {

                @Override
                public void onClick(View v) {
                    pos.cancelSetAmount();
                    dialog.dismiss();
                }

            });
            dialog.setCanceledOnTouchOutside(false);
//            dialog.show();
            pos.setAmount("200", cashbackAmount, "156", QPOSService.TransactionType.GOODS);
        }

        /**
         * 判断是否请求在线连接请求
         * TODO 简单描述该方法的实现功能（可选）
         *
         * @see com.dspread.xpos.QPOSService.QPOSServiceListener#onRequestIsServerConnected()
         */
        @Override
        public void onRequestIsServerConnected() {
            TRACE.d("onRequestIsServerConnected()");
            pos.isServerConnected(true);
        }

        @Override
        public void onRequestOnlineProcess(final String tlv) {
            TRACE.d("onRequestOnlineProcess" + tlv);
            dismissDialog();
            dialog = new Dialog(mContext);
            dialog.setContentView(R.layout.alert_dialog);
            dialog.setTitle(R.string.request_data_to_server);
            Hashtable<String, String> decodeData = pos.anlysEmvIccData(tlv);
            TRACE.d("anlysEmvIccData(tlv):" + decodeData.toString());

            if (isPinCanceled) {
                ((TextView) dialog.findViewById(R.id.messageTextView))
                        .setText(R.string.replied_failed);
            } else {
                ((TextView) dialog.findViewById(R.id.messageTextView))
                        .setText(R.string.replied_success);
            }
            try {
//                    analyData(tlv);// analy tlv ,get the tag you need
            } catch (Exception e) {
                e.printStackTrace();
            }


            dialog.findViewById(R.id.confirmButton).setOnClickListener(
                    new View.OnClickListener() {

                        @Override
                        public void onClick(View v) {
                            if (isPinCanceled) {
                                pos.sendOnlineProcessResult(null);
                            } else {
//									String str = "5A0A6214672500000000056F5F24032307315F25031307085F2A0201565F34010182027C008407A00000033301018E0C000000000000000002031F009505088004E0009A031406179C01009F02060000000000019F03060000000000009F0702AB009F080200209F0902008C9F0D05D86004A8009F0E0500109800009F0F05D86804F8009F101307010103A02000010A010000000000CE0BCE899F1A0201569F1E0838333230314943439F21031826509F2608881E2E4151E527899F2701809F3303E0F8C89F34030203009F3501229F3602008E9F37042120A7189F4104000000015A0A6214672500000000056F5F24032307315F25031307085F2A0201565F34010182027C008407A00000033301018E0C000000000000000002031F00";
//									str = "9F26088930C9018CAEBCD69F2701809F101307010103A02802010A0100000000007EF350299F370415B4E5829F360202179505000004E0009A031504169C01009F02060000000010005F2A02015682027C009F1A0201569F03060000000000009F330360D8C89F34030203009F3501229F1E0838333230314943438408A0000003330101019F090200209F410400000001";
                                String str = "8A023030";//Currently the default value,
                                // should be assigned to the server to return data,
                                // the data format is TLV
                                pos.sendOnlineProcessResult(str);//脚本通知/55域/ICCDATA

                            }
                            dismissDialog();
                        }
                    });

            dialog.show();

        }


        @Override
        public void onRequestTime() {
            TRACE.d("onRequestTime");
            TRACE.d("要求终端时间。已回覆");
            dismissDialog();
            String terminalTime = new SimpleDateFormat("yyyyMMddHHmmss").format(Calendar.getInstance().getTime());
            pos.sendTime(terminalTime);
            statusEditText.setText(getString(R.string.request_terminal_time) + " " + terminalTime);
        }

        @Override
        public void onRequestDisplay(QPOSService.Display displayMsg) {
            TRACE.d("onRequestDisplay(Display displayMsg):" + displayMsg.toString());

            dismissDialog();

            String msg = "";
            if (displayMsg == QPOSService.Display.CLEAR_DISPLAY_MSG) {
                msg = "";
            } else if (displayMsg == QPOSService.Display.MSR_DATA_READY) {
                AlertDialog.Builder builder = new AlertDialog.Builder(mContext);
                builder.setTitle("音频");
                builder.setMessage("Success,Contine ready");
                builder.setPositiveButton("确定", null);
                builder.show();
            } else if (displayMsg == QPOSService.Display.PLEASE_WAIT) {
                msg = getString(R.string.wait);
            } else if (displayMsg == QPOSService.Display.REMOVE_CARD) {
                msg = getString(R.string.remove_card);
            } else if (displayMsg == QPOSService.Display.TRY_ANOTHER_INTERFACE) {
                msg = getString(R.string.try_another_interface);
            } else if (displayMsg == QPOSService.Display.PROCESSING) {
                msg = getString(R.string.processing);

            } else if (displayMsg == QPOSService.Display.INPUT_PIN_ING) {
                msg = "please input pin on pos";

            } else if (displayMsg == QPOSService.Display.INPUT_OFFLINE_PIN_ONLY || displayMsg == QPOSService.Display.INPUT_LAST_OFFLINE_PIN) {
                msg = "please input offline pin on pos";

            } else if (displayMsg == QPOSService.Display.MAG_TO_ICC_TRADE) {
                msg = "please insert chip card on pos";
            } else if (displayMsg == QPOSService.Display.CARD_REMOVED) {
                msg = "card removed";
            }
            statusEditText.setText(msg);
        }

        @Override
        public void onRequestFinalConfirm() {
            TRACE.d("onRequestFinalConfirm() ");
            TRACE.d("onRequestFinalConfirm+确认金额-- S");
            dismissDialog();
            if (!isPinCanceled) {
                dialog = new Dialog(mContext);
                dialog.setContentView(R.layout.confirm_dialog);
                dialog.setTitle(getString(R.string.confirm_amount));

                String message = getString(R.string.amount) + ": $" + amount;
                if (!cashbackAmount.equals("")) {
                    message += "\n" + getString(R.string.cashback_amount) + ": $" + cashbackAmount;
                }

                ((TextView) dialog.findViewById(R.id.messageTextView)).setText(message);

                dialog.findViewById(R.id.confirmButton).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        pos.finalConfirm(true);
                        dialog.dismiss();
                        TRACE.d("确认金额-- 结束");
                    }
                });

                dialog.findViewById(R.id.cancelButton).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        pos.finalConfirm(false);
                        dialog.dismiss();
                    }
                });
                dialog.show();
            } else {
                pos.finalConfirm(false);
            }
        }

        @Override
        public void onRequestNoQposDetected() {
            TRACE.d("onRequestNoQposDetected()");
            dismissDialog();
            statusEditText.setText(getString(R.string.no_device_detected));
        }

        @Override
        public void onRequestQposConnected() {
            TRACE.d("onRequestQposConnected()");
            Toast.makeText(mContext, "onRequestQposConnected", Toast.LENGTH_LONG).show();
            dismissDialog();

            statusEditText.setText(getString(R.string.device_plugged));
            doTradeButton.setEnabled(true);
            btnDisconnect.setEnabled(true);
        }

        @Override
        public void onRequestQposDisconnected() {
            dismissDialog();
            TRACE.d("onRequestQposDisconnected()");
            statusEditText.setText(getString(R.string.device_unplugged));
            btnDisconnect.setEnabled(false);
            doTradeButton.setEnabled(false);

        }

        @Override
        public void onError(QPOSService.Error errorState) {


            TRACE.d("onError" + errorState.toString());
            dismissDialog();

            if (errorState == QPOSService.Error.CMD_NOT_AVAILABLE) {
                statusEditText.setText(getString(R.string.command_not_available));

            } else if (errorState == QPOSService.Error.TIMEOUT) {
                statusEditText.setText(getString(R.string.device_no_response));
            } else if (errorState == QPOSService.Error.DEVICE_RESET) {
                statusEditText.setText(getString(R.string.device_reset));
            } else if (errorState == QPOSService.Error.UNKNOWN) {
                statusEditText.setText(getString(R.string.unknown_error));
            } else if (errorState == QPOSService.Error.DEVICE_BUSY) {
                statusEditText.setText(getString(R.string.device_busy));
            } else if (errorState == QPOSService.Error.INPUT_OUT_OF_RANGE) {
                statusEditText.setText(getString(R.string.out_of_range));
            } else if (errorState == QPOSService.Error.INPUT_INVALID_FORMAT) {
                statusEditText.setText(getString(R.string.invalid_format));
            } else if (errorState == QPOSService.Error.INPUT_ZERO_VALUES) {
                statusEditText.setText(getString(R.string.zero_values));
            } else if (errorState == QPOSService.Error.INPUT_INVALID) {
                statusEditText.setText(getString(R.string.input_invalid));
            } else if (errorState == QPOSService.Error.CASHBACK_NOT_SUPPORTED) {
                statusEditText.setText(getString(R.string.cashback_not_supported));
            } else if (errorState == QPOSService.Error.CRC_ERROR) {
                statusEditText.setText(getString(R.string.crc_error));
            } else if (errorState == QPOSService.Error.COMM_ERROR) {
                statusEditText.setText(getString(R.string.comm_error));
            } else if (errorState == QPOSService.Error.MAC_ERROR) {
                statusEditText.setText(getString(R.string.mac_error));
            } else if (errorState == QPOSService.Error.APP_SELECT_TIMEOUT) {
                statusEditText.setText(getString(R.string.app_select_timeout_error));
            } else if (errorState == QPOSService.Error.CMD_TIMEOUT) {
                statusEditText.setText(getString(R.string.cmd_timeout));
            } else if (errorState == QPOSService.Error.ICC_ONLINE_TIMEOUT) {
                if (pos == null) {
                    return;
                }
                pos.resetPosStatus();
                statusEditText.setText(getString(R.string.device_reset));
            }
        }

        @Override
        public void onReturnReversalData(String tlv) {
            String content = getString(R.string.reversal_data);
            content += tlv;
            TRACE.d("onReturnReversalData(): " + tlv);
            statusEditText.setText(content);
        }

        @Override
        public void onReturnGetPinResult(Hashtable<String, String> result) {
            TRACE.d("onReturnGetPinResult(Hashtable<String, String> result):" + result.toString());
            String pinBlock = result.get("pinBlock");
            String pinKsn = result.get("pinKsn");
            String content = "get pin result\n";
            content += getString(R.string.pinKsn) + " " + pinKsn + "\n";
            content += getString(R.string.pinBlock) + " " + pinBlock + "\n";
            statusEditText.setText(content);
            TRACE.i(content);
        }

        @Override
        public void onReturnApduResult(boolean arg0, String arg1, int arg2) {
            // TODO Auto-generated method stub
            TRACE.d("onReturnApduResult(boolean arg0, String arg1, int arg2):" + arg0 + TRACE.NEW_LINE + arg1 + TRACE.NEW_LINE + arg2);
        }

        @Override
        public void onReturnPowerOffIccResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onReturnPowerOffIccResult(boolean arg0):" + arg0);

        }

        @Override
        public void onReturnPowerOnIccResult(boolean arg0, String arg1, String arg2, int arg3) {
            // TODO Auto-generated method stub
            TRACE.d("onReturnPowerOnIccResult(boolean arg0, String arg1, String arg2, int arg3) :" + arg0 + TRACE.NEW_LINE + arg1 + TRACE.NEW_LINE + arg2 + TRACE.NEW_LINE + arg3);

            if (arg0) {
                pos.sendApdu("123456");
            }
        }

        @Override
        public void onReturnSetSleepTimeResult(boolean isSuccess) {
            TRACE.d("onReturnSetSleepTimeResult(boolean isSuccess):" + isSuccess);

            String content = "";
            if (isSuccess) {
                content = "set the sleep time success.";
            } else {
                content = "set the sleep time failed.";
            }
            statusEditText.setText(content);
        }

        @Override
        public void onGetCardNoResult(String cardNo) {//获取卡号的回调
            TRACE.d("onGetCardNoResult(String cardNo):" + cardNo);

            statusEditText.setText("cardNo: " + cardNo);
        }

        @Override
        public void onRequestCalculateMac(String calMac) {
            // statusEditText.setText("calMac: " + calMac);
            // TRACE.d("calMac_result: calMac=> " + calMac);
            TRACE.d("onRequestCalculateMac(String calMac):" + calMac);

            if (calMac != null && !"".equals(calMac)) {
                calMac = QPOSUtil.byteArray2Hex(calMac.getBytes());
            }
            statusEditText.setText("calMac: " + calMac);
            TRACE.d("calMac_result: calMac=> e: " + calMac);

        }

        @Override
        public void onRequestSignatureResult(byte[] arg0) {
            TRACE.d("onRequestSignatureResult(byte[] arg0):" + arg0.toString());

        }

        @Override
        public void onRequestUpdateWorkKeyResult(QPOSService.UpdateInformationResult result) {
            TRACE.d("onRequestUpdateWorkKeyResult(UpdateInformationResult result):" + result);

            if (result == QPOSService.UpdateInformationResult.UPDATE_SUCCESS) {
                statusEditText.setText("update work key success");
            } else if (result == QPOSService.UpdateInformationResult.UPDATE_FAIL) {
                statusEditText.setText("update work key fail");
            } else if (result == QPOSService.UpdateInformationResult.UPDATE_PACKET_VEFIRY_ERROR) {
                statusEditText.setText("update work key packet vefiry error");
            } else if (result == QPOSService.UpdateInformationResult.UPDATE_PACKET_LEN_ERROR) {
                statusEditText.setText("update work key packet len error");
            }
        }

        @Override
        public void onReturnCustomConfigResult(boolean isSuccess, String result) {
            TRACE.d("onReturnCustomConfigResult(boolean isSuccess, String result):" + isSuccess + TRACE.NEW_LINE + result);

            statusEditText.setText("result: " + isSuccess + "\ndata: " + result);
        }

        @Override
        public void onRequestSetPin() {
            TRACE.d("onRequestSetPin()");
            dismissDialog();
            dialog = new Dialog(mContext);
            dialog.setContentView(R.layout.pin_dialog);
            dialog.setTitle(getString(R.string.enter_pin));
            dialog.findViewById(R.id.confirmButton).setOnClickListener(new View.OnClickListener() {

                @Override
                public void onClick(View v) {
                    String pin = ((EditText) dialog.findViewById(R.id.pinEditText)).getText().toString();
                    if (pin.length() >= 4 && pin.length() <= 12) {
                        if (pin.equals("000000")) {
                            pos.sendEncryptPin("5516422217375116");

                        } else {
                            pos.sendPin(pin);
                        }
                        dismissDialog();
                    }
                }
            });

            dialog.findViewById(R.id.bypassButton).setOnClickListener(new View.OnClickListener() {

                @Override
                public void onClick(View v) {
//					pos.bypassPin();
                    pos.sendPin("");

                    dismissDialog();
                }
            });

            dialog.findViewById(R.id.cancelButton).setOnClickListener(new View.OnClickListener() {

                @Override
                public void onClick(View v) {
                    isPinCanceled = true;
                    pos.cancelPin();
                    dismissDialog();
                }
            });

            dialog.show();

        }


        @Override
        public void onReturnSetMasterKeyResult(boolean isSuccess) {
            TRACE.d("onReturnSetMasterKeyResult(boolean isSuccess) : " + isSuccess);


            statusEditText.setText("result: " + isSuccess);
        }

        @Override
        public void onReturnBatchSendAPDUResult(LinkedHashMap<Integer, String> batchAPDUResult) {
            TRACE.d("onReturnBatchSendAPDUResult(LinkedHashMap<Integer, String> batchAPDUResult):" + batchAPDUResult.toString());

            StringBuilder sb = new StringBuilder();
            sb.append("APDU Responses: \n");
            for (HashMap.Entry<Integer, String> entry : batchAPDUResult.entrySet()) {
                sb.append("[" + entry.getKey() + "]: " + entry.getValue() + "\n");
            }
            statusEditText.setText("\n" + sb.toString());
        }

        @Override
        public void onBluetoothBondFailed() {
            TRACE.d("onBluetoothBondFailed()");
            statusEditText.setText("bond failed");
        }

        @Override
        public void onBluetoothBondTimeout() {
            TRACE.d("onBluetoothBondTimeout()");
            statusEditText.setText("bond timeout");
        }

        @Override
        public void onBluetoothBonded() {
            TRACE.d("onBluetoothBonded()");
            statusEditText.setText("bond success");

        }

        @Override
        public void onBluetoothBonding() {
            TRACE.d("onBluetoothBonding()");
            statusEditText.setText("bonding .....");

        }

        @Override
        public void onReturniccCashBack(Hashtable<String, String> result) {
            TRACE.d("onReturniccCashBack(Hashtable<String, String> result):" + result.toString());
            String s = "serviceCode: " + result.get("serviceCode");
            s += "\n";
            s += "trackblock: " + result.get("trackblock");

            statusEditText.setText(s);

        }


        @Override
        public void onLcdShowCustomDisplay(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onLcdShowCustomDisplay(boolean arg0):" + arg0);
        }

        @Override
        public void onUpdatePosFirmwareResult(QPOSService.UpdateInformationResult arg0) {
            TRACE.d("onUpdatePosFirmwareResult(UpdateInformationResult arg0):" + arg0.toString());

        }

        @Override
        public void onReturnDownloadRsaPublicKey(HashMap<String, String> map) {
            TRACE.d("onReturnDownloadRsaPublicKey(HashMap<String, String> map):" + map.toString());
            if (map == null) {
                TRACE.d("MainActivity++++++++++++++map == null");
                return;
            }
            String randomKeyLen = map.get("randomKeyLen");
            String randomKey = map.get("randomKey");
            String randomKeyCheckValueLen = map.get("randomKeyCheckValueLen");
            String randomKeyCheckValue = map.get("randomKeyCheckValue");
            TRACE.d("randomKey" + randomKey + "    \n    randomKeyCheckValue" + randomKeyCheckValue);
            statusEditText.setText("randomKeyLen:" + randomKeyLen + "\nrandomKey:" + randomKey + "\nrandomKeyCheckValueLen:" + randomKeyCheckValueLen + "\nrandomKeyCheckValue:"
                    + randomKeyCheckValue);
        }

        @Override
        public void onGetPosComm(int mod, String amount, String posid) {
            TRACE.d("onGetPosComm(int mod, String amount, String posid):" + mod + TRACE.NEW_LINE + amount + TRACE.NEW_LINE + posid);


        }


        @Override
        public void onPinKey_TDES_Result(String arg0) {
            TRACE.d("onPinKey_TDES_Result(String arg0):" + arg0);
            statusEditText.setText("result:" + arg0);

        }

        @Override
        public void onUpdateMasterKeyResult(boolean arg0, Hashtable<String, String> arg1) {
            // TODO Auto-generated method stub
            TRACE.d("onUpdateMasterKeyResult(boolean arg0, Hashtable<String, String> arg1):" + arg0 + TRACE.NEW_LINE + arg1.toString());

        }

        @Override
        public void onEmvICCExceptionData(String arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onEmvICCExceptionData(String arg0):" + arg0);

        }

        @Override
        public void onSetParamsResult(boolean arg0, Hashtable<String, Object> arg1) {
            // TODO Auto-generated method stub
            TRACE.d("onSetParamsResult(boolean arg0, Hashtable<String, Object> arg1):" + arg0 + TRACE.NEW_LINE + arg1.toString());

        }

        @Override
        public void onGetInputAmountResult(boolean arg0, String arg1) {
            // TODO Auto-generated method stub
            TRACE.d("onGetInputAmountResult(boolean arg0, String arg1):" + arg0 + TRACE.NEW_LINE + arg1.toString());

        }

        @Override
        public void onReturnNFCApduResult(boolean arg0, String arg1, int arg2) {
            // TODO Auto-generated method stub
            TRACE.d("onReturnNFCApduResult(boolean arg0, String arg1, int arg2):" + arg0 + TRACE.NEW_LINE + arg1 + TRACE.NEW_LINE + arg2);
            statusEditText.setText("onReturnNFCApduResult(boolean arg0, String arg1, int arg2):" + arg0 + TRACE.NEW_LINE + arg1 + TRACE.NEW_LINE + arg2);

        }

        @Override
        public void onReturnPowerOffNFCResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d(" onReturnPowerOffNFCResult(boolean arg0) :" + arg0);
            statusEditText.setText(" onReturnPowerOffNFCResult(boolean arg0) :" + arg0);
        }

        @Override
        public void onReturnPowerOnNFCResult(boolean arg0, String arg1, String arg2, int arg3) {
            // TODO Auto-generated method stub
            TRACE.d("onReturnPowerOnNFCResult(boolean arg0, String arg1, String arg2, int arg3):" + arg0 + TRACE.NEW_LINE + arg1 + TRACE.NEW_LINE + arg2 + TRACE.NEW_LINE + arg3);
            statusEditText.setText("onReturnPowerOnNFCResult(boolean arg0, String arg1, String arg2, int arg3):" + arg0 + TRACE.NEW_LINE + arg1 + TRACE.NEW_LINE + arg2 + TRACE.NEW_LINE + arg3);
        }


        @Override
        public void onCbcMacResult(String result) {
            TRACE.d("onCbcMacResult(String result):" + result);

            if (result == null || "".equals(result)) {
                statusEditText.setText("cbc_mac:false");
            } else {
                statusEditText.setText("cbc_mac: " + result);
            }
        }

        @Override
        public void onReadBusinessCardResult(boolean arg0, String arg1) {
            // TODO Auto-generated method stub
            TRACE.d(" onReadBusinessCardResult(boolean arg0, String arg1):" + arg0 + TRACE.NEW_LINE + arg1);

        }

        @Override
        public void onWriteBusinessCardResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d(" onWriteBusinessCardResult(boolean arg0):" + arg0);

        }

        @Override
        public void onConfirmAmountResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onConfirmAmountResult(boolean arg0):" + arg0);

        }

        @Override
        public void onQposIsCardExist(boolean cardIsExist) {
            TRACE.d("onQposIsCardExist(boolean cardIsExist):" + cardIsExist);

            if (cardIsExist) {
                statusEditText.setText("cardIsExist:" + cardIsExist);
            } else {
                statusEditText.setText("cardIsExist:" + cardIsExist);

            }
        }

        @Override
        public void onSearchMifareCardResult(Hashtable<String, String> arg0) {
            if (arg0 != null)
                TRACE.d("onSearchMifareCardResult(Hashtable<String, String> arg0):" + arg0.toString());

        }

        @Override
        public void onBatchReadMifareCardResult(String msg, Hashtable<String, List<String>> cardData) {
            if (cardData != null)
                TRACE.d("onBatchReadMifareCardResult(boolean arg0):" + msg + cardData.toString());
        }

        @Override
        public void onBatchWriteMifareCardResult(String msg, Hashtable<String, List<String>> cardData) {
            if (cardData != null)
                TRACE.d("onBatchWriteMifareCardResult(boolean arg0):" + msg + cardData.toString());
        }

        @Override
        public void onSetBuzzerResult(boolean arg0) {
            TRACE.d("onSetBuzzerResult(boolean arg0):" + arg0);


        }

        @Override
        public void onSetBuzzerTimeResult(boolean b) {
            TRACE.d("onSetBuzzerTimeResult(boolean b):" + b);

        }

        @Override
        public void onSetBuzzerStatusResult(boolean b) {
            TRACE.d("onSetBuzzerStatusResult(boolean b):" + b);

        }

        @Override
        public void onGetBuzzerStatusResult(String s) {
            TRACE.d("onGetBuzzerStatusResult(String s):" + s);

        }

        @Override
        public void onSetManagementKey(boolean arg0) {
            TRACE.d("onSetManagementKey(boolean arg0):" + arg0);

        }

        @Override
        public void onReturnUpdateIPEKResult(boolean arg0) {
            TRACE.d("onReturnUpdateIPEKResult(boolean arg0):" + arg0);

        }

        @Override
        public void onReturnUpdateEMVRIDResult(boolean arg0) {
            TRACE.d("onReturnUpdateEMVRIDResult(boolean arg0):" + arg0);

            if (arg0) {
                statusEditText.setText("operation RID EMV success");

            } else {
                statusEditText.setText("operation RID EMV fail");

            }
        }

        @Override
        public void onReturnUpdateEMVResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onReturnUpdateEMVResult(boolean arg0):" + arg0);
            if (arg0) {
                statusEditText.setText("operation EMV app success");
            } else {
                statusEditText.setText("operation emv app fail~");
            }
        }

        @Override
        public void onBluetoothBoardStateResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onBluetoothBoardStateResult(boolean arg0):" + arg0);


        }

        @Override
        public void onDeviceFound(BluetoothDevice arg0) {
            // TODO Auto-generated method stub

        }


        @Override
        public void onSetSleepModeTime(boolean arg0) {
            TRACE.d("onSetSleepModeTime(boolean arg0):" + arg0);

            if (arg0) {
                statusEditText.setText("set the Sleep timee Success");
            } else {
                statusEditText.setText("set the Sleep timee unSuccess");
            }
        }

        @Override
        public void onReturnGetEMVListResult(String arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onReturnGetEMVListResult(String arg0):" + arg0);

            if (arg0 != null && arg0.length() > 0) {
                statusEditText.setText("The emv list is : " + arg0);
            }
        }

        @Override
        public void onWaitingforData(String arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onWaitingforData(String arg0):" + arg0);

        }

        @Override
        public void onRequestDeviceScanFinished() {
            // TODO Auto-generated method stub
            TRACE.d("onRequestDeviceScanFinished()");

        }

        @Override
        public void onRequestUpdateKey(String arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onRequestUpdateKey(String arg0):" + arg0);

            statusEditText.setText("update checkvalue : " + arg0);

        }

        @Override
        public void onReturnGetQuickEmvResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onReturnGetQuickEmvResult(boolean arg0):" + arg0);

            if (arg0) {
                statusEditText.setText("emv已配置");
//				isQuickEmv=true;
                pos.setQuickEmv(true);
            } else {
                statusEditText.setText("emv未配置");
            }
        }

        @Override
        public void onQposDoGetTradeLogNum(String arg0) {
            TRACE.d("onQposDoGetTradeLogNum(String arg0):" + arg0);

            int a = Integer.parseInt(arg0, 16);
            if (a >= 188) {
                statusEditText.setText("the trade num has become max value!!");
                return;
            }
            statusEditText.setText("get log num:" + a);
        }

        @Override
        public void onQposDoTradeLog(boolean arg0) {
            TRACE.d("onQposDoTradeLog(boolean arg0) :" + arg0);

            // TODO Auto-generated method stub
            if (arg0) {
                statusEditText.setText("clear log success!");
            } else {
                statusEditText.setText("clear log fail!");
            }
        }

        @Override
        public void onAddKey(boolean arg0) {
            TRACE.d("onAddKey(boolean arg0) :" + arg0);

            if (arg0) {
                statusEditText.setText("ksn add 1 success");
            } else {
                statusEditText.setText("ksn add 1 failed");
            }
        }

        @Override
        public void onQposKsnResult(Hashtable<String, String> arg0) {
            TRACE.d("onQposKsnResult(Hashtable<String, String> arg0):" + arg0.toString());

            // TODO Auto-generated method stub
            String pinKsn = arg0.get("pinKsn");
            String trackKsn = arg0.get("trackKsn");
            String emvKsn = arg0.get("emvKsn");
            TRACE.d("get the ksn result is :" + "pinKsn" + pinKsn + "\ntrackKsn" + trackKsn + "\nemvKsn" + emvKsn);

        }

        @Override
        public void onQposDoGetTradeLog(String arg0, String arg1) {
            TRACE.d("onQposDoGetTradeLog(String arg0, String arg1):" + arg0 + TRACE.NEW_LINE + arg1);

            // TODO Auto-generated method stub
            arg1 = QPOSUtil.convertHexToString(arg1);
            statusEditText.setText("orderId:" + arg1 + "\ntrade log:" + arg0);
        }

        @Override
        public void onRequestDevice() {
            List<UsbDevice> deviceList = getPermissionDeviceList();
            UsbManager mManager = (UsbManager) mContext.getSystemService(Context.USB_SERVICE);
            for (int i = 0; i < deviceList.size(); i++) {
                UsbDevice usbDevice = deviceList.get(i);
                if (usbDevice.getVendorId() == 2965 || usbDevice.getVendorId() == 0x03EB) {

                    if (mManager.hasPermission(usbDevice)) {
                        pos.setPermissionDevice(usbDevice);
                    } else {
                        devicePermissionRequest(mManager, usbDevice);

                    }
                }
            }


        }

        @Override
        public void onGetKeyCheckValue(List<String> checkValue) {
            if (checkValue != null) {
                StringBuffer buffer = new StringBuffer();
                buffer.append("{");
                for (int i = 0; i < checkValue.size(); i++) {
                    buffer.append(checkValue.get(i)).append(",");
                }
                buffer.append("}");

                statusEditText.setText(buffer.toString());
            }


        }

        @Override
        public void onGetDevicePubKey(String clearKeys) {
            TRACE.d("onGetDevicePubKey(clearKeys):" + clearKeys);

            statusEditText.setText(clearKeys);
            String lenStr = clearKeys.substring(0, 4);
            int sum = 0;
            for (int i = 0; i < 4; i++) {
                int bit = Integer.parseInt(lenStr.substring(i, i + 1));
                sum += bit * Math.pow(16, (3 - i));
            }
            pubModel = clearKeys.substring(4, 4 + sum * 2);



        }

        @Override
        public void onTradeCancelled() {
            TRACE.d("onTradeCancelled");
            dismissDialog();

        }

        @Override
        public void onReturnSetAESResult(boolean isSuccess, String result) {

        }

        @Override
        public void onReturnAESTransmissonKeyResult(boolean isSuccess, String result) {

        }

        @Override
        public void onReturnSignature(boolean b, String signaturedData) {
            if (b) {
                BASE64Encoder base64Encoder = new BASE64Encoder();
                String encode = base64Encoder.encode(signaturedData.getBytes());
                statusEditText.setText("signature data (Base64 encoding):" + encode);
            }
        }

        @Override
        public void onReturnConverEncryptedBlockFormat(String result) {
            statusEditText.setText(result);
        }

        @Override
        public void onQposIsCardExistInOnlineProcess(boolean haveCard) {

        }


        @Override
        public void onFinishMifareCardResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onFinishMifareCardResult(boolean arg0):" + arg0);

            if (arg0) {
                statusEditText.setText("finish success");
            } else {
                statusEditText.setText("finish fail");
            }
        }

        @Override
        public void onVerifyMifareCardResult(boolean arg0) {
            TRACE.d("onVerifyMifareCardResult(boolean arg0):" + arg0);

            // TODO Auto-generated method stub
//			String msg = pos.getMifareStatusMsg();
            if (arg0) {
                statusEditText.setText(" onVerifyMifareCardResult success");

            } else {

                statusEditText.setText("onVerifyMifareCardResult fail");
            }
        }

        @Override
        public void onReadMifareCardResult(Hashtable<String, String> arg0) {
            // TODO Auto-generated method stub
//			String msg = pos.getMifareStatusMsg();
            if (arg0 != null) {
                TRACE.d("onReadMifareCardResult(Hashtable<String, String> arg0):" + arg0.toString());

                String addr = arg0.get("addr");
                String cardDataLen = arg0.get("cardDataLen");
                String cardData = arg0.get("cardData");
                statusEditText.setText("addr:" + addr + "\ncardDataLen:" + cardDataLen + "\ncardData:" + cardData);
            } else {
//				statusEditText.setText("onReadWriteMifareCardResult fail"+msg);
            }
        }

        @Override
        public void onWriteMifareCardResult(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onWriteMifareCardResult(boolean arg0):" + arg0);

            if (arg0) {
                statusEditText.setText("write data success!");
            } else {
                statusEditText.setText("write data fail!");
            }
        }

        @Override
        public void onOperateMifareCardResult(Hashtable<String, String> arg0) {
            // TODO Auto-generated method stub

            if (arg0 != null) {
                TRACE.d("onOperateMifareCardResult(Hashtable<String, String> arg0):" + arg0.toString());

                String cmd = arg0.get("Cmd");
                String blockAddr = arg0.get("blockAddr");
                statusEditText.setText("Cmd:" + cmd + "\nBlock Addr:" + blockAddr);
            } else {
                statusEditText.setText("operate failed");
            }
        }

        @Override
        public void getMifareCardVersion(Hashtable<String, String> arg0) {

            // TODO Auto-generated method stub
            if (arg0 != null) {
                TRACE.d("getMifareCardVersion(Hashtable<String, String> arg0):" + arg0.toString());

                String verLen = arg0.get("versionLen");
                String ver = arg0.get("cardVersion");
                statusEditText.setText("versionLen:" + verLen + "\nverison:" + ver);
            } else {
                statusEditText.setText("get mafire UL version failed");
            }
        }

        @Override
        public void getMifareFastReadData(Hashtable<String, String> arg0) {
            // TODO Auto-generated method stub

            if (arg0 != null) {
                TRACE.d("getMifareFastReadData(Hashtable<String, String> arg0):" + arg0.toString());
                String startAddr = arg0.get("startAddr");
                String endAddr = arg0.get("endAddr");
                String dataLen = arg0.get("dataLen");
                String cardData = arg0.get("cardData");
                statusEditText.setText("startAddr:" + startAddr + "\nendAddr:" + endAddr + "\ndataLen:" + dataLen
                        + "\ncardData:" + cardData);
            } else {
                statusEditText.setText("read fast UL failed");
            }
        }

        @Override
        public void getMifareReadData(Hashtable<String, String> arg0) {

            if (arg0 != null) {
                TRACE.d("getMifareReadData(Hashtable<String, String> arg0):" + arg0.toString());

                String blockAddr = arg0.get("blockAddr");
                String dataLen = arg0.get("dataLen");
                String cardData = arg0.get("cardData");
                statusEditText.setText("blockAddr:" + blockAddr + "\ndataLen:" + dataLen + "\ncardData:" + cardData);
            } else {
                statusEditText.setText("read mafire UL failed");
            }
        }

        @Override
        public void writeMifareULData(String arg0) {

            if (arg0 != null) {
                TRACE.d("writeMifareULData(String arg0):" + arg0.toString());

                statusEditText.setText("addr:" + arg0);
            } else {
                statusEditText.setText("write UL failed");
            }
        }

        @Override
        public void verifyMifareULData(Hashtable<String, String> arg0) {

            if (arg0 != null) {
                TRACE.d("verifyMifareULData(Hashtable<String, String> arg0):" + arg0.toString());

                String dataLen = arg0.get("dataLen");
                String pack = arg0.get("pack");
                statusEditText.setText("dataLen:" + dataLen + "\npack:" + pack);
            } else {
                statusEditText.setText("verify UL failed");
            }
        }

        @Override
        public void onGetSleepModeTime(String arg0) {
            // TODO Auto-generated method stub

            if (arg0 != null) {
                TRACE.d("onGetSleepModeTime(String arg0):" + arg0.toString());

                int time = Integer.parseInt(arg0, 16);
                statusEditText.setText("time is ： " + time + " seconds");
            } else {
                statusEditText.setText("get the time is failed");
            }
        }

        @Override
        public void onGetShutDownTime(String arg0) {

            if (arg0 != null) {
                TRACE.d("onGetShutDownTime(String arg0):" + arg0.toString());

                statusEditText.setText("shut down time is : " + Integer.parseInt(arg0, 16) + "s");
            } else {
                statusEditText.setText("get the shut down time is fail!");
            }
        }

        @Override
        public void onQposDoSetRsaPublicKey(boolean arg0) {
            // TODO Auto-generated method stub
            TRACE.d("onQposDoSetRsaPublicKey(boolean arg0):" + arg0);

            if (arg0) {
                statusEditText.setText("set rsa is successed!");

            } else {
                statusEditText.setText("set rsa is failed!");
            }
        }

        @Override
        public void onQposGenerateSessionKeysResult(Hashtable<String, String> arg0) {

            if (arg0 != null) {
                TRACE.d("onQposGenerateSessionKeysResult(Hashtable<String, String> arg0):" + arg0.toString());
                String rsaFileName = arg0.get("rsaReginString");
                String enPinKeyData = arg0.get("enPinKey");
                String enKcvPinKeyData = arg0.get("enPinKcvKey");
                String enCardKeyData = arg0.get("enDataCardKey");
                String enKcvCardKeyData = arg0.get("enKcvDataCardKey");
                statusEditText.setText("rsaFileName:" + rsaFileName + "\nenPinKeyData:" + enPinKeyData + "\nenKcvPinKeyData:" +
                        enKcvPinKeyData + "\nenCardKeyData:" + enCardKeyData + "\nenKcvCardKeyData:" + enKcvCardKeyData);
            } else {
                statusEditText.setText("get key failed,pls try again!");
            }
        }

        @Override
        public void transferMifareData(String arg0) {
            TRACE.d("transferMifareData(String arg0):" + arg0.toString());

            // TODO Auto-generated method stub
            if (arg0 != null) {
                statusEditText.setText("response data:" + arg0);
            } else {
                statusEditText.setText("transfer data failed!");
            }
        }

        @Override
        public void onReturnRSAResult(String arg0) {
            TRACE.d("onReturnRSAResult(String arg0):" + arg0.toString());

            if (arg0 != null) {
                statusEditText.setText("rsa data:\n" + arg0);
            } else {
                statusEditText.setText("get the rsa failed");
            }
        }

        @Override
        public void onRequestNoQposDetectedUnbond() {
            // TODO Auto-generated method stub
            TRACE.d("onRequestNoQposDetectedUnbond()");


        }


    }

    private void sendMsgDelay(int what) {
        Message msg = new Message();
        msg.what = what;
        mHandler.sendMessageDelayed(msg,500);
    }

    private void deviceShowDisplay(String diplay) {

        Log.e("execut start:", "deviceShowDisplay");
        String customDisplayString = "";
        try {
            byte[] paras = diplay.getBytes("GBK");
            customDisplayString = QPOSUtil.byteArray2Hex(paras);
            pos.lcdShowCustomDisplay(QPOSService.LcdModeAlign.LCD_MODE_ALIGNCENTER, customDisplayString, 60);
        } catch (Exception e) {
            e.printStackTrace();
            TRACE.d("gbk error");
            Log.e("execut error:", "deviceShowDisplay");
        }
        Log.e("execut end:", "deviceShowDisplay");

    }

    private void devicePermissionRequest(UsbManager mManager, UsbDevice usbDevice) {
        PendingIntent mPermissionIntent = PendingIntent.getBroadcast(this, 0, new Intent(
                "com.android.example.USB_PERMISSION"), 0);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        registerReceiver(mUsbReceiver, filter);
        mManager.requestPermission(usbDevice, mPermissionIntent);
    }

    private static final String ACTION_USB_PERMISSION = "com.android.example.USB_PERMISSION";
    private final BroadcastReceiver mUsbReceiver = new BroadcastReceiver() {

        @Override
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
                            TRACE.i("usb" + "permission granted for device "
                                    + device);
                            pos.setPermissionDevice(device);
                        }
                    } else {
                        TRACE.i("usb" + "permission denied for device " + device);

                    }
                    mContext.unregisterReceiver(mUsbReceiver);
                }
            }
        }
    };

    private List getPermissionDeviceList() {
        UsbManager mManager = (UsbManager) this.getSystemService(Context.USB_SERVICE);
        List deviceList = new ArrayList<UsbDevice>();
        // check for existing devices
        for (UsbDevice device : mManager.getDeviceList().values()) {

            deviceList.add(device);
        }
        return deviceList;
    }

    private void clearDisplay() {
        statusEditText.setText("");
    }
    class MyOnClickListener implements View.OnClickListener {

        @SuppressLint("NewApi")
        @Override
        public void onClick(View v) {
            statusEditText.setText("");
            if (selectBTFlag) {
                statusEditText.setText(R.string.wait);
                return;
            } else if (v == doTradeButton) {//开始按钮
                mhipStatus.setTextColor(getResources().getColor(R.color.eb_col_34));
                mhipStatus.setText("");
                if (pos == null) {
                    statusEditText.setText(R.string.scan_bt_pos_error);
                    return;
                }
                isPinCanceled = false;

                statusEditText.setText(R.string.starting);
//                terminalTime = new SimpleDateFormat("yyyyMMddHHmmss").format(Calendar.getInstance().getTime());
                if (posType == POS_TYPE.UART) {//通用异步收发报机
                    pos.setCardTradeMode(QPOSService.CardTradeMode.SWIPE_TAP_INSERT_CARD_NOTUP);
//                    pos.doTrade(terminalTime, 0, 30);
                    pos.doTrade(20);
                } else {
                    int keyIdex = getKeyIndex();
//                    pos.setCardTradeMode(QPOSService.CardTradeMode.SWIPE_TAP_INSERT_CARD_NOTUP);
                    pos.doTrade(keyIdex, 30);//start do trade
                }
            } else if (v == btnUSB) {
                USBClass usb = new USBClass();
                ArrayList<String> deviceList = usb.GetUSBDevices(getBaseContext());
                if (deviceList == null) {
                    Toast.makeText(mContext, "没有权限", Toast.LENGTH_SHORT).show();
                    return;
                }
                final CharSequence[] items = deviceList.toArray(new CharSequence[deviceList.size()]);

                AlertDialog.Builder builder = new AlertDialog.Builder(mContext);
                builder.setTitle("Select a Reader");
                builder.setSingleChoiceItems(items, -1, new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog, int item) {
                        String selectedDevice = (String) items[item];

                        dialog.dismiss();

                        usbDevice = USBClass.getMdevices().get(selectedDevice);
                        open(QPOSService.CommunicationMode.USB_OTG_CDC_ACM);
                        posType = POS_TYPE.OTG;
                        pos.openUsb(usbDevice);
                    }
                });
                AlertDialog alert = builder.create();
                alert.show();
            }else if(v == btn_poweron){
                statusEditText.setText("Please tap your card...");
                pos.powerOnNFC(true,20);
            }else if(v == btn_sendApdu){
                pos.sendApdu("123456");
            }else if(v == btn_poweroff){
                pos.powerOffNFC(20);
            }
        }
    }

    private int getKeyIndex() {
        String s = mKeyIndex.getText().toString();
        if (TextUtils.isEmpty(s))
            return 0;
        int i = 0;
        try {
            i = Integer.parseInt(s);
            if (i > 9 || i < 0)
                i = 0;
        } catch (Exception e) {
            i = 0;
            return i;
        }
        return i;
    }

    private void sendMsg(int what) {
        Message msg = new Message();
        msg.what = what;
        mHandler.sendMessage(msg);
    }

    private boolean selectBTFlag = false;
    private Handler mHandler = new Handler() {
        @Override
        public void handleMessage(Message msg) {
            super.handleMessage(msg);
            switch (msg.what) {

                case 8003:
                    try {
                        Thread.sleep(200);
                    } catch (InterruptedException e) {
                        e.printStackTrace();
                    }
                    String content = "";
                    if (nfcLog == null) {

                        Hashtable<String, String> h = pos.getNFCBatchData();
                        String tlv = h.get("tlv");
                        TRACE.i("nfc batchdata1: " + tlv);
                        content = statusEditText.getText().toString() + "\nNFCbatchData: " + h.get("tlv");
                    } else {
                        content = statusEditText.getText().toString() + "\nNFCbatchData: " + nfcLog;
                    }
                    statusEditText.setText(content);
//                    autoDoTrade(0);
                    break;

                default:
                    break;
            }
        }
    };

	/*---------------------------------------------*/
    private static final String FILENAME = "dsp_axdd";

}

