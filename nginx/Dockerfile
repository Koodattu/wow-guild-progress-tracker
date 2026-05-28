FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/suomiwow.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
