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
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Install composer packages if composer.json exists
COPY composer.json composer.lock* ./
RUN composer install --no-dev --optimize-autoloader --no-interaction || true

# Copy backend source files
COPY . .

RUN mkdir -p application/cache application/logs uploads \
    && chown -R www-data:www-data /var/www/html

RUN sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# Bind Apache to Railway's dynamic $PORT
CMD ["sh", "-c", "sed -i 's/80/'${PORT:-8080}'/g' /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf && apache2-foreground"]
