package com.first_player_games.Api;

import android.content.Context;

public class LudoApiRepository {
    private static LudoApiRepository instance;

    public static synchronized LudoApiRepository getInstance() {
        if (instance == null) {
            instance = new LudoApiRepository();
        }
        return instance;
    }

    public void init(Context context) {
        // Placeholder until full :ludogame module is provided
    }

    public void call_api_leaveTable() {
        // Placeholder until full :ludogame module is provided
    }
}
