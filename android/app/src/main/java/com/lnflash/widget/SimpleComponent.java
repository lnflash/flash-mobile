package com.dspread.demoui.widget;


import android.view.LayoutInflater;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.binioter.guideview.Component;
import com.dspread.demoui.R;

/**
 * Created by Qianmeng on 2020/3/10
 * Edited by Qianmeng on 2020/3/10
 */
public class SimpleComponent implements Component {
    private TextView txt;

    @Override public View getView(LayoutInflater inflater) {
        LinearLayout ll = (LinearLayout) inflater.inflate(R.layout.layer_frends, null);
        txt = ll.findViewById(R.id.txt_prompt_msg);
        ll.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) {
            }
        });
        return ll;
    }

    @Override public int getAnchor() {
        return Component.ANCHOR_BOTTOM;
    }

    @Override public int getFitPosition() {
        return Component.FIT_CENTER;
    }

    @Override public int getXOffset() {
        return 0;
    }

    @Override public int getYOffset() {
        return 10;
    }

    public void setText(String msg){
        if(txt != null){
            txt.setText(msg);
        }
    }

}
