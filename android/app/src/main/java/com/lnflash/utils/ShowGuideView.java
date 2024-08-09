package com.dspread.demoui.utils;

import android.app.Activity;
import android.widget.Button;

import com.binioter.guideview.Guide;
import com.binioter.guideview.GuideBuilder;
import com.dspread.demoui.widget.SimpleComponent;

/**
 * Created by Qianmeng on 2020/3/10
 * Edited by Qianmeng on 2020/3/10
 */
public class ShowGuideView {
    public void show(final Button button, final Activity context,String msg){
        GuideBuilder builder = new GuideBuilder();
        builder.setTargetView(button)
                .setAlpha(150)
                .setHighTargetCorner(20)
                .setHighTargetPadding(8);
        builder.setOnVisibilityChangedListener(new GuideBuilder.OnVisibilityChangedListener() {
            @Override
            public void onShown() {
            }

            @Override
            public void onDismiss() {
                listener.onGuideListener(button);
            }
        });
        SimpleComponent simpleComponent = new SimpleComponent();
        builder.addComponent(simpleComponent);
        Guide guide = builder.createGuide();
        guide.show(context);
        simpleComponent.setText(msg);
    }


    /**
     * 定义一个接口
     */
    public interface  onGuideViewListener{
        void onGuideListener(Button btn);
    }
    /**
     *定义一个变量储存数据
     */
    private onGuideViewListener listener;
    /**
     *提供公共的方法,并且初始化接口类型的数据
     */
    public void setListener(onGuideViewListener listener){
        this.listener = listener;
    }

}
