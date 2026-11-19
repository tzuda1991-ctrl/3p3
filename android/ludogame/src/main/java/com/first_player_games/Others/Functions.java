package com.first_player_games.Others;

public class Functions {
    public static boolean checkStringisValid(String value) {
        return value != null && !value.trim().isEmpty() && !value.equalsIgnoreCase("null");
    }
}
