{{/*
Expand the name of the chart.
*/}}
{{- define "pulp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified name. The operator derives service names from the Pulp CR name
(<name>-api-svc, <name>-web-svc), so keep this short and stable.
*/}}
{{- define "pulp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "pulp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "pulp.labels" -}}
helm.sh/chart: {{ include "pulp.chart" . }}
app.kubernetes.io/name: {{ include "pulp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "pulp.databaseSecretName" -}}
{{- if .Values.database.existingSecret }}
{{- .Values.database.existingSecret }}
{{- else }}
{{- printf "%s-database" (include "pulp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "pulp.s3SecretName" -}}
{{- if .Values.objectStorage.existingSecret }}
{{- .Values.objectStorage.existingSecret }}
{{- else }}
{{- printf "%s-s3" (include "pulp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "pulp.settingsConfigMapName" -}}
{{- printf "%s-settings" (include "pulp.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fail early on configurations that the operator would reject or that would
silently produce a broken deployment.
*/}}
{{- define "pulp.validate" -}}
{{- if .Values.ingress.enabled }}
{{- if not .Values.ingress.host }}
{{- fail "ingress.host is required when ingress.enabled is true" }}
{{- end }}
{{- if not .Values.ingress.tlsSecret }}
{{- fail "ingress.tlsSecret is required when ingress.enabled is true" }}
{{- end }}
{{- end }}
{{- if .Values.objectStorage.enabled }}
{{- if not .Values.objectStorage.existingSecret }}
{{- if not .Values.objectStorage.s3.bucket }}
{{- fail "objectStorage.s3.bucket is required (or set objectStorage.existingSecret)" }}
{{- end }}
{{- if not (or .Values.objectStorage.s3.endpoint .Values.objectStorage.s3.region) }}
{{- fail "objectStorage.s3.endpoint or objectStorage.s3.region is required" }}
{{- end }}
{{- end }}
{{- else }}
{{- if not .Values.fileStorage.storageClass }}
{{- fail "fileStorage.storageClass is required when objectStorage.enabled is false" }}
{{- end }}
{{- end }}
{{- if and (not .Values.database.existingSecret) (not .Values.database.host) }}
{{- fail "database.host is required (or set database.existingSecret)" }}
{{- end }}
{{- if .Values.signing.enabled }}
{{- if and (not .Values.signing.existingSecret) (not .Values.signing.privateKey) }}
{{- fail "signing.existingSecret or signing.privateKey is required when signing.enabled is true" }}
{{- end }}
{{- end }}
{{- end }}
