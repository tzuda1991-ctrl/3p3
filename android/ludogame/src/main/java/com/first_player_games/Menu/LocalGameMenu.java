package com.first_player_games.Menu;

import android.content.Context;
import android.widget.Toast;

public class LocalGameMenu {
    private final Context context;

    public LocalGameMenu(Context context) {
        this.context = context;
    }

    public void showMenu() {
        Toast.makeText(context, "Ludo module placeholder", Toast.LENGTH_SHORT).show();
    }

    public void onGameStartAction(boolean[] players) {
        // Override in caller
    }
}
