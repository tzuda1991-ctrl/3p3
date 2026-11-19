package com.first_player_games.ludoApi.bottomFragment;

import android.os.Bundle;
import android.widget.Toast;
import com.first_player_games.ClassCallback;
import com.google.android.material.bottomsheet.BottomSheetDialogFragment;

public class LudoActiveTables_BF extends BottomSheetDialogFragment {
    private ClassCallback callback;

    public void setCallback(ClassCallback callback) {
        this.callback = callback;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getContext() != null) {
            Toast.makeText(getContext(), "Ludo module placeholder", Toast.LENGTH_SHORT).show();
        }
        dismissAllowingStateLoss();
    }
}
