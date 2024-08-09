package com.dspread.demoui.utils;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.res.AssetManager;
import android.os.Environment;
import android.text.TextUtils;

//import com.dspread.xpos.Tip;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Hashtable;
import java.util.List;

/**
 * Created by dsppc11 on 2019/3/21.
 */

public class FileUtils {

    public static final String POS_Storage_Dir = Environment.getExternalStorageDirectory().getAbsolutePath() + File.separator + "dspread" + File.separator;


    public static byte[] readLine(String fileName) {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        FileInputStream fis = null;

        try {

            File file = new File(POS_Storage_Dir + fileName);

            fis = new FileInputStream(file);

            byte[] data = new byte[50];
            int current = 0;
            while ((current = fis.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, current);
            }


        } catch (Exception ex) {

            ex.printStackTrace();

            try {
                if (fis != null) {
                    fis.close();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        return buffer.toByteArray();
    }


    public static byte[] readAssetsLine(String fileName, Context context) {

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try {
            android.content.ContextWrapper contextWrapper = new ContextWrapper(context);
            AssetManager assetManager = contextWrapper.getAssets();
            InputStream inputStream = assetManager.open(fileName);
            byte[] data = new byte[512];
            int current = 0;
            while ((current = inputStream.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, current);
            }

        } catch (Exception e) {
            e.printStackTrace();
            return  null;
        }
        return buffer.toByteArray();

    }

    public static String readAssetsLineAsString(String fileName, Context context) {

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try {
            android.content.ContextWrapper contextWrapper = new ContextWrapper(context);
            AssetManager assetManager = contextWrapper.getAssets();
            InputStream inputStream = assetManager.open(fileName);
            byte[] data = new byte[512];
            int current = 0;
            while ((current = inputStream.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, current);
            }

        } catch (Exception e) {
            e.printStackTrace();
            return  "";
        }
        return buffer.toString();

    }


    /**
     * 获取指定目录内所有文件路径
     *
     * @param dirPath 需要查询的文件目录
     */
    public static List<String> getAllFiles(String dirPath) {
        File f = new File(dirPath);
        if (!f.exists()) {//判断路径是否存在
            f.mkdir();
            return null;
        }

        File[] files = f.listFiles();

        if (files == null) {//判断权限
            return null;
        }

        ArrayList fileList = new ArrayList();
        for (File _file : files) {//遍历目录
            if (_file.isFile()) {
                String _name = _file.getName();
//                String filePath = _file.getAbsolutePath();//获取文件路径
                String fileName = _file.getName();//获取文件名
//                fileList.add(filePath.concat(fileName));
                fileList.add(fileName);
            } else if (_file.isDirectory()) {//查询子目录
                getAllFiles(_file.getAbsolutePath());
            } else {
            }
        }
        return fileList;
    }
}
