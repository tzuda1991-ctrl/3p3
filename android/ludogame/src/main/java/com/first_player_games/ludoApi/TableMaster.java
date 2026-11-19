package com.first_player_games.ludoApi;

public class TableMaster {
    public static class TableDatum {
        private String invite_code = "";
        private String onlineMembers = "0";
        private String bootValue = "0";

        public String getInvite_code() {
            return invite_code;
        }

        public String getOnlineMembers() {
            return onlineMembers;
        }

        public String getBootValue() {
            return bootValue;
        }
    }
}
