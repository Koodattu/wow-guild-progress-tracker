FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our config as the main one
COPY nginx.conf /etc/nginx/conf.d/suomiwow.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
