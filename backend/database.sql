-- Teen Patti Champion — Auto-Applied MySQL Schema for Railway
-- Note: backend/index.php automatically runs these CREATE TABLE IF NOT EXISTS statements on startup.

CREATE TABLE IF NOT EXISTS tbl_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL DEFAULT 'Player',
  mobile VARCHAR(20) UNIQUE,
  email VARCHAR(160) DEFAULT '',
  password VARCHAR(255) DEFAULT '',
  gender VARCHAR(20) DEFAULT 'male',
  profile_pic VARCHAR(255) DEFAULT '',
  wallet DECIMAL(14,2) NOT NULL DEFAULT 1000.00,
  winning_wallet DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  bonus_wallet DECIMAL(14,2) NOT NULL DEFAULT 100.00,
  spin_remaining INT NOT NULL DEFAULT 3,
  game_played INT NOT NULL DEFAULT 0,
  referral_code VARCHAR(40) DEFAULT '',
  referred_by VARCHAR(40) DEFAULT '',
  bank_detail TEXT NULL,
  upi VARCHAR(120) DEFAULT '',
  adhar_card VARCHAR(60) DEFAULT '',
  token VARCHAR(255) DEFAULT '',
  fcm VARCHAR(255) DEFAULT '',
  status TINYINT(1) NOT NULL DEFAULT 1,
  added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tbl_otp (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mobile VARCHAR(20) NOT NULL,
  otp VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tbl_setting (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teen_patti TINYINT(1) DEFAULT 1,
  dragon_tiger TINYINT(1) DEFAULT 1,
  andar_bahar TINYINT(1) DEFAULT 1,
  point_rummy TINYINT(1) DEFAULT 1,
  private_rummy TINYINT(1) DEFAULT 0,
  pool_rummy TINYINT(1) DEFAULT 0,
  deal_rummy TINYINT(1) DEFAULT 0,
  seven_up_down TINYINT(1) DEFAULT 1,
  car_roulette TINYINT(1) DEFAULT 1,
  jackpot_teen_patti TINYINT(1) DEFAULT 1,
  animal_roulette TINYINT(1) DEFAULT 1,
  color_prediction TINYINT(1) DEFAULT 1,
  poker TINYINT(1) DEFAULT 0,
  head_tails TINYINT(1) DEFAULT 0,
  red_vs_black TINYINT(1) DEFAULT 0,
  ludo_local TINYINT(1) DEFAULT 0,
  ludo_online TINYINT(1) DEFAULT 0,
  ludo_computer TINYINT(1) DEFAULT 0,
  bacarate TINYINT(1) DEFAULT 0,
  jhandi_munda TINYINT(1) DEFAULT 0,
  roulette TINYINT(1) DEFAULT 0,
  tournament_rummy TINYINT(1) DEFAULT 0,
  referral_amount DECIMAL(10,2) DEFAULT 50.00,
  joining_amount DECIMAL(10,2) DEFAULT 100.00,
  app_version VARCHAR(20) DEFAULT '1.0',
  terms TEXT NULL,
  privacy_policy TEXT NULL,
  updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tbl_setting (id, terms, privacy_policy)
VALUES (1, 'Play responsibly. 18+ only.', 'We protect your account and gameplay data.')
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS tbl_banner (
  id INT AUTO_INCREMENT PRIMARY KEY,
  banner VARCHAR(255) NOT NULL,
  status TINYINT(1) DEFAULT 1,
  added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tbl_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  type VARCHAR(40) NOT NULL DEFAULT 'credit',
  gateway VARCHAR(40) DEFAULT 'upi',
  txn_ref VARCHAR(120) DEFAULT '',
  status VARCHAR(30) DEFAULT 'pending',
  added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_txn_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tbl_withdrawal_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  coin DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status TINYINT(1) NOT NULL DEFAULT 0,
  added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_withdraw_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
