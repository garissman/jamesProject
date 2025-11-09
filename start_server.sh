#!/bin/zsh

/home/james/.nvm/versions/node/v22.21.0/bin/npm --prefix /home/james/jamesProject/frontend install
/home/james/.nvm/versions/node/v22.21.0/bin/npm --prefix /home/james/jamesProject/frontend run build
/home/james/jamesProject/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000