package com.dspread.demoui.widget;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.widget.ListView;
import android.widget.ScrollView;

public class InnerListview extends ListView{
//	private ScrollView parentScrollView;
	public InnerListview(Context context) {
		super(context);
		
		// TODO Auto-generated constructor stub
	}
	

	public InnerListview(Context context, AttributeSet attrs, int defStyleAttr) {
		super(context, attrs, defStyleAttr);
		// TODO Auto-generated constructor stub
	}



	public InnerListview(Context context, AttributeSet attrs) {
		super(context, attrs);
		// TODO Auto-generated constructor stub
	}
	
	/*public void setParentScrollview(ScrollView parentScrollView){
		this.parentScrollView=parentScrollView;
	}*/
	
	//该方法是让listview自动适应scrollview的高度。随着listview的增加，scrollview也会变长
	//但是此时的listview需要为wrapcontent。
	 protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
	        int expandSpec = MeasureSpec.makeMeasureSpec(Integer.MAX_VALUE >> 2,
	        MeasureSpec.AT_MOST);
	        super.onMeasure(widthMeasureSpec, expandSpec);
	    }
	
	 //下面的方法是让listview保证一定的高度，从而让listview在某个位置滑动，scrollview也可以滑动
	/*@Override
	public boolean onInterceptTouchEvent(MotionEvent ev) {
		// TODO Auto-generated method stub
		switch (ev.getAction()) {
		case MotionEvent.ACTION_DOWN:
			setParentScrollAble(false);
			break;
		case MotionEvent.ACTION_CANCEL:
			setParentScrollAble(true);
			break;
		default:
			break;
		}
		return super.onInterceptTouchEvent(ev);
	}
	
	 private void setParentScrollAble(boolean flag) {
	     
		  parentScrollView.requestDisallowInterceptTouchEvent(!flag);//这里的parentScrollView就是listview外面的那个scrollview
	 }*/
}
