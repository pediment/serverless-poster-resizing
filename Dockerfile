FROM amazonlinux:2023

WORKDIR /tmp

RUN yum -y install gcc-c++ make tar gzip && \
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && \
    yum -y install nodejs && \
    npm install -g npm@latest && \
    npm cache clean --force && \
    yum clean all

WORKDIR /build
