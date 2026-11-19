package com.first_player_games.LocalGame;

import android.os.Bundle;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class LocalGame extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Toast.makeText(this, "Ludo module placeholder", Toast.LENGTH_SHORT).show();
        finish();
    }
}
