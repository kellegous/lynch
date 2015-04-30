ALL: serve

bin/pork:
	GOPATH=`pwd` go get github.com/kellegous/pork/tools/pork

serve: bin/pork
	bin/pork serve