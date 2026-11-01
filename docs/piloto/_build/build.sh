#!/bin/bash
cd /workspace/work/puente-piloto-docs
for f in ${@:-consentimiento-familias aval-escuela confidencialidad-docentes plan-incidentes guia-piloto registro-aaip}; do
  pandoc "$f.md" -o "pdf/$f.pdf" --pdf-engine=pdflatex \
    -H _build/header.tex -V fontfamily=helvet \
    -V fontsize=10pt -V geometry:a4paper,margin=1.8cm,headheight=14pt,includehead \
    -V colorlinks=true -V linkcolor=blue -V urlcolor=blue 2>&1 | grep -v "^$"
  echo "done $f $?"
done
