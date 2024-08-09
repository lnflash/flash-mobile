package com.dspread.demoui.utils;

import java.util.ArrayList;
import java.util.List;
/*
*
* tlv:5F200D202020202020202020202020204F08A0000003330101015F24032412319F160F4243544553543132333435363738009F21031142259A031808039F02060000000011119F03060000000000009F34034203009F120A50424F432044454249549F0607A00000033301015F300202209F4E0F616263640000000000000000000000C40A621067FFFFFFFFF0474FC10A00000332100300E0008BC708B04EFFA147D84FB4C00A00000332100300E00074C28201983ABB68B0A87865BFCAC1FCD6D2794C9C293A667EA2E0DF8FE08658105DF18EE870CDE7714573245EF4F1509F4F7DD2D8AA3A0700570556BB30C5BB3AA0D95C26B9A7A1A0FE45CCCF939D7587D3DBDF3D1D96722F7F9F8C1E0077C89BA4D4D267F74A60CF65E1D66F62685B6E41C25BDAEA4F353EBF9021195824842693CB76733CDEBFC61C6E75F9A87DBB33181C301074FDD300028A1037B8372CE0943EFBA84C82D2448DD142941895136A46CF65F84DFC6A792F502D556DA84106584AFDE8A0838B45E8E1BDAE9747FDF91C10E9D7BC9C5EE15CF0A1746ADDB8F7CB96EA672B127B19FF06A733509B5A04F5BF31D1678C2E5951CABE67E34E97AD946B4DACF3CA500188625890BCA60D7D29A63ED9F6CAEE3369C4E5DC9C2F890200FF24986DD6931BB13FC145D46B1961888B9317263C22351F98796A4FF75CF2262797535D54FD7B58F24535286C3A0EFA9524EE642EB6818EED427F8A447244A883E73FB36AAFB72B2C8EF0829E086CC87E6005E3CBE4C7E3A79CBF339320342B547C4E6D256BB98F78FE9E9A5434EF4CAB734093CD0329667FF2FA
*
* */


public class TLVParser {

    private static ArrayList<TLV> tlvList = new ArrayList<TLV>();

    public static List<TLV> parse(String tlv) {
        try {
            tlvList.clear();
            return getTLVList(hexToByteArray(tlv));
        } catch (Exception e) {
            if (tlvList.size() > 0)
                return tlvList;
            return null;
        }
    }

    private static List<TLV> getTLVList(byte[] data) {
        int index = 0;

        byte[] tag;
        byte[] length;
        byte[] value;
        boolean isNested;
        TLV tlv = null;
        while (index < data.length) {

            isNested = false;

            if ((data[index] & (byte) 0x20) == (byte) (0x20)) {
                isNested = true;
                //复合结构
            } else {
                isNested = false;
            }

            if ((data[index] & (byte) 0x1F) == (byte) (0x1F)) {
                int lastByte = index + 1;
                while ((data[lastByte] & (byte) 0x80) == (byte) 0x80) {
                    ++lastByte;
                }
                tag = new byte[lastByte - index + 1];
                System.arraycopy(data, index, tag, 0, tag.length);
                index += tag.length;
            } else {
                tag = new byte[1];
                tag[0] = data[index];
                ++index;

                if (tag[0] == 0x00) {
                    break;
                }
            }

            if ((data[index] & (byte) 0x80) == (byte) (0x80)) {
                int n = (data[index] & (byte) 0x7F) + 1;
                length = new byte[n];
                System.arraycopy(data, index, length, 0, length.length);
                index += length.length;
            } else {
                length = new byte[1];
                length[0] = data[index];
                ++index;
            }

            int n = getLengthInt(length);
            value = new byte[n];
            System.arraycopy(data, index, value, 0, value.length);
            index += value.length;
            if (isNested) {
                getTLVList(value);
            }else {
                tlv = new TLV();
                tlv.tag = toHexString(tag);
                tlv.length = toHexString(length);
                tlv.value = toHexString(value);
                tlv.isNested = isNested;
                tlvList.add(tlv);
            }
        }
        return tlvList;
    }

    public static List<TLV> parseWithoutValue(String tlv) {
        try {
            return getTLVListWithoutValue(hexToByteArray(tlv));
        } catch (Exception e) {
            return null;
        }
    }

    private static List<TLV> getTLVListWithoutValue(byte[] data) {
        int index = 0;

        ArrayList<TLV> tlvList = new ArrayList<TLV>();

        while (index < data.length) {

            byte[] tag;
            byte[] length;

            boolean isNested;
            if ((data[index] & (byte) 0x20) == (byte) (0x20)) {
                isNested = true;
            } else {
                isNested = false;
            }

            if ((data[index] & (byte) 0x1F) == (byte) (0x1F)) {
                int lastByte = index + 1;
                while ((data[lastByte] & (byte) 0x80) == (byte) 0x80) {
                    ++lastByte;
                }
                tag = new byte[lastByte - index + 1];
                System.arraycopy(data, index, tag, 0, tag.length);
                index += tag.length;
            } else {
                tag = new byte[1];
                tag[0] = data[index];
                ++index;

                if (tag[0] == 0x00) {
                    break;
                }
            }

            if ((data[index] & (byte) 0x80) == (byte) (0x80)) {
                int n = (data[index] & (byte) 0x7F) + 1;
                length = new byte[n];
                System.arraycopy(data, index, length, 0, length.length);
                index += length.length;
            } else {
                length = new byte[1];
                length[0] = data[index];
                ++index;
            }

            TLV tlv = new TLV();
            tlv.tag = toHexString(tag);
            tlv.length = toHexString(length);
            tlv.isNested = isNested;

            tlvList.add(tlv);
        }
        return tlvList;
    }

    private static int getLengthInt(byte[] data) {
        if ((data[0] & (byte) 0x80) == (byte) (0x80)) {
            int n = data[0] & (byte) 0x7F;
            int length = 0;
            for (int i = 1; i < n + 1; ++i) {
                length <<= 8;
                length |= (data[i] & 0xFF);
            }
            return length;
        } else {
            return data[0] & 0xFF;
        }
    }



    // 十六进制字符串转字节数组
    public static byte[] hexToByteArray(String hexStr) {
        if (hexStr.length() < 1)
            return null;
        byte[] result = new byte[hexStr.length() / 2];
        for (int i = 0; i < hexStr.length() / 2; i++) {
            int high = Integer.parseInt(hexStr.substring(i * 2, i * 2 + 1), 16);
            int low = Integer.parseInt(hexStr.substring(i * 2 + 1, i * 2 + 2),
                    16);
            result[i] = (byte) (high * 16 + low);
        }
        return result;
    }

    protected static String toHexString(byte[] b) {
        String result = "";
        for (int i = 0; i < b.length; i++) {
            result += Integer.toString((b[i] & 0xFF) + 0x100, 16).substring(1);
        }
        return result;
    }

    public static TLV searchTLV(List<TLV> tlvList, String targetTag) {
        for (int i = 0; i < tlvList.size(); ++i) {
            TLV tlv = tlvList.get(i);
            if (tlv.tag.equalsIgnoreCase(targetTag)) {
                return tlv;
            } else if (tlv.isNested) {
                TLV searchChild = searchTLV(tlv.tlvList, targetTag);
                if (searchChild != null) {
                    return searchChild;
                }
            }
        }
        return null;
    }


    public static void main(String[] args) {
        String tlv = "5F201A5052415645454E204B554D41522042204E20202020202020202F4F07A00000000310105F24032311309F160F4243544553543132333435363738009F21031244089A031907109F02060000000000059F03060000000000009F34034203009F120A564953412044454249549F0607A00000000310105F300202269F4E0F616263640000000000000000000000C408414367FFFFFF0912C10A10218083100492E0000CC70836D3E567845F788FC00A10218083100492E0000CC2820198BBA22DE72324CD77FBFE7BCA8343BC2F26719BBC1F4633FB0E10329E35018CB35077D634CD3A84F998F52DFAC4F0442E2CD03A85D89BFF630D8A85727132E12C88664FBE5A664BB8AA21FF0D10A2D79E324D87B4225A5B9AAC68BD1FFCF5DD334B38D128B02E983DBBD32EC35DBE26CFFA01C11C272F99D8095107DE981818534873828880F1091B8BC62FD39C8394B19E7A410CF9C870CF27986D0CB251E0B6B2D364DE7F3EF1453B397B9FD2D181668510BA16DE250BEC7C1C6A3C12F7006B6B7660D7B331D326D2EA4990F899B4D11AC17D3C0FF63AEF482A349CD8849D906F60B320832E41D8349316E55DE764F8C0AF6ACE3AACA43B3994536A231BE2E790471EB559F4B9FAA5370067B7A0EA3FE59421B7AC17FA5383C6BB3159EBDE3718FEC72CC20EC1AE178386B4F7B3948C97A439AB0F70A386B392276B9B30D8398BAFE3D01AEAB03079368EEF05248E5FAE7BAB070E527981BB25F441A9224AC66DAE623BECDD9B0D1BB05A6EBCAE1E9151FB7AE3E5034B57BD6C3D609276B7743176179A801AD1B378B4629D08263148859ADDE1687CB5E9D0104D84851E5733F4C95D71E880EF20607C";
        List<TLV> parse = parse(tlv);
        for (TLV tlvcon:parse) {
            System.out.println(tlvcon.toString());
        }

    }

    /*
    *
    * 验证tlv格式
    * 只取第一个tlv作判断 一旦遇到0代表结束
    * tlv 为true
    * tv 为false
    * */
    public static boolean VerifyTLV(String emvCfg) {

        if (emvCfg.startsWith("9F06"))
            return true;
        if (emvCfg.startsWith("00"))
            return false;
        byte[] data = hexToByteArray(emvCfg);
        int index = 0;
        byte[] length;


        if ((data[index] & (byte) 0x20) == (byte) (0x20)) {
            return false;
        }

        if ((data[index] & (byte) 0x1F) == (byte) (0x1F)) {
            int lastByte = index + 1;
            while ((data[lastByte] & (byte) 0x80) == (byte) 0x80) {
                ++lastByte;
            }
            index += lastByte - index + 1;
            if (index >= data.length)
                return false;

        } else {
            if (data[index] == 0x00) {
                return false;
            }
            ++index;
        }

        if ((data[index] & (byte) 0x80) == (byte) (0x80)) {
            int n = (data[index] & (byte) 0x7F) + 1;
            length = new byte[n];
            index += length.length;
        } else {
            length = new byte[1];
            length[0] = data[index];
            ++index;
        }

        int n = getLengthInt(length);
        if ((n + index) > data.length)
            return false;

        return true;
    }
}
