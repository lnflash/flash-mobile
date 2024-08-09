package com.dspread.demoui.utils;

import java.util.List;

public class TLV {
	
	public String tag;
	public String length;
	public String value;
	
	public boolean isNested;
	public List<TLV> tlvList;

	@Override
	public String toString() {
		return "TLV{" +
				"tag='" + tag + '\'' +
				", length='" + length + '\'' +
				", value='" + value + '\'' +
				", isNested=" + isNested +
				'}';
	}
}
