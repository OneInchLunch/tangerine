{{/*
Expand the name of the chart.
*/}}
{{- define "tangerine.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "tangerine.fullname" -}}
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

{{/*
Chart label.
*/}}
{{- define "tangerine.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "tangerine.labels" -}}
helm.sh/chart: {{ include "tangerine.chart" . }}
{{ include "tangerine.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "tangerine.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tangerine.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Service account name.
*/}}
{{- define "tangerine.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "tangerine.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
ConfigMap name.
*/}}
{{- define "tangerine.configMapName" -}}
{{- printf "%s-config" (include "tangerine.fullname" .) }}
{{- end }}

{{/*
Gateway resource name.
*/}}
{{- define "tangerine.gatewayName" -}}
{{- printf "%s-gateway" (include "tangerine.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Gateway selector labels. Kept separate from the UI so NetworkPolicies can
distinguish the two workloads.
*/}}
{{- define "tangerine.gatewaySelectorLabels" -}}
app.kubernetes.io/name: {{ printf "%s-gateway" (include "tangerine.name" .) | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Gateway labels.
*/}}
{{- define "tangerine.gatewayLabels" -}}
helm.sh/chart: {{ include "tangerine.chart" . }}
{{ include "tangerine.gatewaySelectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Gateway base path without the trailing slash, for Ingress paths and the
forwardAuth URL. Derived from config.gatewayBasePath so the UI, gateway, and
ingress cannot drift.
*/}}
{{- define "tangerine.gatewayPath" -}}
{{- $path := trimSuffix "/" (default "/sso/" .Values.config.gatewayBasePath) -}}
{{- if not (hasPrefix "/" $path) -}}
{{- fail "config.gatewayBasePath must start with /" -}}
{{- end -}}
{{- if eq $path "" -}}
{{- fail "config.gatewayBasePath must not be /" -}}
{{- end -}}
{{- $path -}}
{{- end }}

{{/*
Public base URL for the gateway.
*/}}
{{- define "tangerine.gatewayExternalUrl" -}}
{{- if .Values.gateway.externalBaseUrl }}
{{- .Values.gateway.externalBaseUrl | trimSuffix "/" }}
{{- else }}
{{- $host := "" }}
{{- range .Values.ingress.hosts }}
{{- if and (not $host) .host }}
{{- $host = .host }}
{{- end }}
{{- end }}
{{- if $host }}
{{- printf "https://%s" $host }}
{{- else }}
{{- "http://localhost:8080" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
PostgreSQL resource name.
*/}}
{{- define "tangerine.postgresName" -}}
{{- printf "%s-postgres" (include "tangerine.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
PostgreSQL selector labels.
*/}}
{{- define "tangerine.postgresSelectorLabels" -}}
app.kubernetes.io/name: {{ printf "%s-postgres" (include "tangerine.name" .) | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PostgreSQL labels.
*/}}
{{- define "tangerine.postgresLabels" -}}
helm.sh/chart: {{ include "tangerine.chart" . }}
{{ include "tangerine.postgresSelectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Name of the Secret holding POSTGRES_* keys for the gateway database.
*/}}
{{- define "tangerine.databaseSecretName" -}}
{{- if eq .Values.postgres.mode "external" -}}
{{- required "postgres.externalSecret is required when postgres.mode=external" .Values.postgres.externalSecret -}}
{{- else if eq .Values.postgres.mode "internal" -}}
{{- if .Values.postgres.auth.existingSecret -}}
{{- .Values.postgres.auth.existingSecret -}}
{{- else -}}
{{- printf "%s-postgres-configuration" (include "tangerine.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- else -}}
{{- fail "postgres.mode must be internal or external" -}}
{{- end -}}
{{- end }}
