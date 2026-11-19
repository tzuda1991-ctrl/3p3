FROM php:8.1-apache

# System packages & PHP extensions required for CodeIgniter + GD + Zip + MySQL
RUN apt-get update && apt-get install -y \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libzip-dev \
    unzip \
    git \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install mysqli pdo pdo_mysql gd zip \
    && a2dismod mpm_event mpm_worker || true \
    && a2enmod mpm_prefork rewrite headers \
    && echo "ServerName localhost" >> /etc/apache2/apache2.conf \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Install composer packages if composer.json exists
COPY composer.json composer.lock* ./
RUN composer install --no-dev --optimize-autoloader --no-interaction || true

# Copy backend source files
COPY . .

RUN mkdir -p application/cache application/logs uploads \
    && chown -R www-data:www-data /var/www/html \
    && chmod +x /var/www/html/start.sh \
    && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

CMD ["/var/www/html/start.sh"]
