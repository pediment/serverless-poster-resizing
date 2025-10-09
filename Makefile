.PHONY: all build dist clean

all: dist

build:
	sam build resize -t resize.yaml -s lambda/ --use-container

dist: build
	mkdir -p dist
	cp -r .aws-sam/build/resize/. dist/build-temp/
	cd dist/build-temp && zip -FS -q -r ../function.zip .
	rm -rf dist/build-temp

clean:
	rm -rf .aws-sam dist
	rm -rf lambda/node_modules
