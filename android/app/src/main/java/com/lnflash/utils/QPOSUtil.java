package com.dspread.demoui.utils;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UnsupportedEncodingException;
import java.util.Hashtable;

import com.dspread.demoui.R;

import android.content.Context;
import android.media.AudioManager;
import android.os.Build;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;


public class QPOSUtil {
    static final String HEXES = "0123456789ABCDEF";

    public static String byteArray2Hex(byte[] raw) {
        if (raw == null) {
            return null;
        }
        final StringBuilder hex = new StringBuilder(2 * raw.length);
        for (final byte b : raw) {
            hex.append(HEXES.charAt((b & 0xF0) >> 4)).append(HEXES.charAt((b & 0x0F)));
        }
        return hex.toString();
    }

    //将hex值转为ascii码
    public static String convertHexToString(String hex) {

        StringBuilder sb = new StringBuilder();
        StringBuilder temp = new StringBuilder();

        //49204c6f7665204a617661 split into two characters 49, 20, 4c...
        for (int i = 0; i < hex.length() - 1; i += 2) {

            //grab the hex in pairs
            String output = hex.substring(i, (i + 2));
            //convert hex to decimal
            int decimal = Integer.parseInt(output, 16);
            //convert the decimal to character
            sb.append((char) decimal);

            temp.append(decimal);
        }

        return sb.toString();
    }

    /**
     * int到byte[] 由高位到低位
     * @param i 需要转换为byte数组的整行值。
     * @return byte数组
     */
    public static byte[] intToByteArray(int i) {
        byte[] result = new byte[2];
//		result[0] = (byte)((i >> 24) & 0xFF);
//		result[1] = (byte)((i >> 16) & 0xFF);
        result[0] = (byte)((i >> 8) & 0xFF);
        result[1] = (byte)(i & 0xFF);
        return result;
    }

    //16 byte xor
    public static String xor16(byte[] src1, byte[] src2){
        byte[] results = new byte[16];
        for (int i = 0; i < results.length; i++){
            results[i] = (byte)(src1[i] ^ src2[i]);
        }
        return QPOSUtil.byteArray2Hex(results);
    }

    /**
     * 16进制格式的字符串转成16进制byte 44 --> byte 0x44
     *
     * @param hexString
     * @return
     */
    public static byte[] HexStringToByteArray(String hexString) {//
        if (hexString == null || hexString.equals("")) {
            return new byte[]{};
        }
        if (hexString.length() == 1 || hexString.length() % 2 != 0) {
            hexString = "0" + hexString;
        }
        hexString = hexString.toUpperCase();
        int length = hexString.length() / 2;
        char[] hexChars = hexString.toCharArray();
        byte[] d = new byte[length];
        for (int i = 0; i < length; i++) {
            int pos = i * 2;
            d[i] = (byte) (charToByte(hexChars[pos]) << 4 | charToByte(hexChars[pos + 1]));
        }
        return d;
    }

    private static byte charToByte(char c) {
        return (byte) "0123456789ABCDEF".indexOf(c);
    }

    /**
     * 中文字符串转成16进制数组
     *
     * @param str
     * @return
     */
    public static byte[] CNToHex(String str) {
        // String string = "";
        // for (int i = 0; i < str.length(); i++) {
        // String s = String.valueOf(str.charAt(i));
        // byte[] bytes = null;
        // try {
        // bytes = s.getBytes("gbk");
        // } catch (UnsupportedEncodingException e) {
        // e.printStackTrace();
        // }
        // for (int j = 0; j < bytes.length; j++) {
        // string += Integer.toHexString(bytes[j] & 0xff);
        // }
        // }
        byte[] b = null;
        try {
            b = str.getBytes("GBK");
        } catch (UnsupportedEncodingException e) {
            e.printStackTrace();
        }
        return b;
    }

    /**
     * byte 转换成16进制格式字符串显示
     *
     * @param b
     * @return
     */
    public static String getHexString(byte[] b) {
        StringBuffer result = new StringBuffer("");
        for (int i = 0; i < b.length; i++) {
            result.append("0x" + Integer.toString((b[i] & 0xff) + 0x100, 16).substring(1) + ",");
        }
        return result.substring(0, result.length() - 1);
    }

    /**
     * int转成16进制的byte
     *
     * @param i
     * @return
     */
    public static byte[] IntToHex(int i) {
        String string = null;
        if (i >= 0 && i < 10) {
            string = "0" + i;
        } else {
            string = Integer.toHexString(i);
        }
        return HexStringToByteArray(string);
    }

    /**
     * 将指定byte数组以16进制的形式打印到控制台
     *
     * @param b
     */
    public static void printHexString(byte[] b) {
        for (int i = 0; i < b.length; i++) {
            String hex = Integer.toHexString(b[i] & 0xFF);
            if (hex.length() == 1) {
                hex = '0' + hex;
            }
            System.out.print(hex.toUpperCase());
        }

    }

    /**
     * 把16进制字节转换成int
     *
     * @param b
     * @return
     */
    public static int byteArrayToInt(byte[] b) {
        int result = 0;
        for (int i = 0; i < b.length; i++) {
            result <<= 8;
            result |= (b[i] & 0xff); //
        }
        return result;
    }

    /**
     * 异或输入字节流
     *
     * @param b
     * @param startPos
     * @param Len
     * @return
     */
    public static byte XorByteStream(byte[] b, int startPos, int Len) {
        byte bRet = 0x00;
        for (int i = 0; i < Len; i++) {
            bRet ^= b[startPos + i];
        }
        return bRet;
    }

    /**
     * Gets the subarray from <tt>array</tt> that starts at <tt>offset</tt>.
     */
    public static byte[] get(byte[] array, int offset) {
        return get(array, offset, array.length - offset);
    }

    /**
     * Gets the subarray of length <tt>length</tt> from <tt>array</tt> that
     * starts at <tt>offset</tt>.
     */
    public static byte[] get(byte[] array, int offset, int length) {
        byte[] result = new byte[length];
        System.arraycopy(array, offset, result, 0, length);
        return result;
    }

    public static void turnUpVolume(Context context, int factor) {
        int sv;

        AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        sv = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, sv * factor / 10, AudioManager.FLAG_PLAY_SOUND);
    }

    /**
     * 将毫秒值转换成时分秒（时长）
     *
     * @param l
     * @return
     */
    public static String formatLongToTimeStr(Long l, Context context) {
        String str = "";
        long hour = 0;
        long minute = 0;
        float second = 0;
        second = (float) l / (float) 1000;
        if (second > 60) {
            minute = (long) (second / 60);
            second = second % 60;
            if (minute > 60) {
                hour = minute / 60;
                minute = minute % 60;
                str = hour + context.getResources().getString(R.string.hours) + minute + context.getResources().getString(R.string.minute) + second
                        + context.getResources().getString(R.string.seconds);
            } else {
                str = minute + context.getResources().getString(R.string.minute) + second + context.getResources().getString(R.string.seconds);
            }
        } else {
            str = second + context.getResources().getString(R.string.seconds);
        }
        return str;

    }

    public static byte[] bcd2asc(byte[] src) {
        byte[] results = new byte[src.length * 2];
        for (int i = 0; i < src.length; i++) {
            // 高Nibble转换
            if (((src[i] & 0xF0) >> 4) <= 9) {
                results[2 * i] = (byte) (((src[i] & 0xF0) >> 4) + 0x30);
            } else {
                results[2 * i] = (byte) (((src[i] & 0xF0) >> 4) + 0x37); // 大写A~F
            }
            // 低Nibble转换
            if ((src[i] & 0x0F) <= 9) {
                results[2 * i + 1] = (byte) ((src[i] & 0x0F) + 0x30);
            } else {
                results[2 * i + 1] = (byte) ((src[i] & 0x0F) + 0x37); // 大写A~F
            }
        }
        return results;
    }

    public static byte[] ecb(byte[] in) {

        byte[] a1 = new byte[8];

        for (int i = 0; i < (in.length / 8); i++) {
            byte[] temp = new byte[8];
            System.arraycopy(in, i * 8, temp, 0, temp.length);
            a1 = xor8(a1, temp);
        }
        if ((in.length % 8) != 0) {
            byte[] temp = new byte[8];
            System.arraycopy(in, (in.length / 8) * 8, temp, 0, in.length - (in.length / 8) * 8);
            a1 = xor8(a1, temp);
        }
        return bcd2asc(a1);
    }

    public static byte[] xor8(byte[] src1, byte[] src2) {
        byte[] results = new byte[8];
        for (int i = 0; i < results.length; i++) {
            results[i] = (byte) (src1[i] ^ src2[i]);
        }
        return results;
    }

    public static String readRSAStream(InputStream in) throws Exception {
        try {
            BufferedReader br = new BufferedReader(new InputStreamReader(in));
            String line = null;
            StringBuilder sb = new StringBuilder();

            while ((line = br.readLine()) != null) {
                if (line.contains("BEGIN")) {
                    sb.delete(0, sb.length());
                } else {
                    if (line.contains("END")) {
                        break;
                    }

                    sb.append(line);
                    sb.append('\r');
                }
            }

            return sb.toString();
        } catch (IOException var5) {
            throw new Exception("鍏\ue104挜鏁版嵁娴佽\ue1f0鍙栭敊锟�?");
        } catch (NullPointerException var6) {
            throw new Exception("鍏\ue104挜杈撳叆娴佷负锟�?");
        }
    }

    public static boolean checkStringAllZero(String str) {
        if (str.startsWith("0"))
            return true;
        boolean result = true;
//        Integer.MAX_VALUE  4个字节
//       long MAX_VALUE = 0x7fffffffffffffffL;
        int byteCou = str.length() / 2;
        int count;
        if (byteCou % 4 == 0) {
            count = byteCou / 4;
        } else {
            count = byteCou / 4 + 1;
        }
        String sub = null;
        for (int i = 0; i < count; i++) {
            if (i == count - 1) {
                sub = str.substring(i * 8, sub.length());
            } else {
                sub = str.substring(i * 8, (i + 1) * 8);
            }
            long l = Long.parseLong(sub, 16);
            if (l > 0) {
                result = false;
                break;
            }
        }
        return result;
    }


}
