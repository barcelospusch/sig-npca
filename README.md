# SIG-NPCA

Sistema Integrado de Gestão do Núcleo de Pesquisa e Caça de Asteroides.

## Tecnologias
- Next.js (App Router)
- React
- Firebase Authentication
- Cloud Firestore
- Vercel Blob

## Instalação
```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Preencha `.env.local` com as credenciais do seu projeto Firebase.

## Firebase
1. Crie um projeto no Firebase Console.
2. Ative **Authentication > Email/Password**.
3. Crie pelo menos um usuário administrativo.
4. Ative o **Cloud Firestore**.
5. Crie a coleção `members` (ela também será criada ao cadastrar o primeiro membro).

## Vercel Blob
Conecte o Blob store `https://hqlu7hdikkpu6spm.public.blob.vercel-storage.com` ao projeto Vercel, habilite os ambientes usados (incluindo Development para desenvolvimento local) e configure o `BLOB_READ_WRITE_TOKEN` gerado para esse store. O token deve ficar apenas nas variáveis de ambiente do servidor; os anexos são enviados diretamente do navegador ao armazenamento público.

As APIs usam o SDK comum do Firebase (`initializeServerApp`) com o token da conta autenticada. Não é necessária conta de serviço. Configure as variáveis públicas do Firebase e `BLOB_READ_WRITE_TOKEN` (somente no servidor). As consultas e transações das APIs obedecem às regras do Firestore.

## Documentos
A página `/documentos` mantém os arquivos e os metadados dos documentos no Vercel Blob; o Firestore não é usado para armazenar registros de documentos. O Firebase continua responsável pela autenticação e pelos dados dos membros do organograma. A publicação é permitida a membros ativos cujo e-mail corresponde ao da conta autenticada e que tenham o cargo de diretor, secretário, tesoureiro ou professor orientador. Cada arquivo pode ter até 20 MB.

Os documentos, metadados e anexos ficam públicos por URL. Não publique arquivos confidenciais nesse armazenamento público. A sessão Firebase Auth da pessoa é usada nas APIs para conferir permissões com os membros do organograma.

### Regras do Firestore
Publique o conteúdo de `firestore.rules` em **Firestore Database > Regras** no projeto Firebase antes de usar o ponto. O SDK comum respeita essas regras também nas APIs; regras antigas que negam o ponto precisam ser substituídas. O arquivo preserva o acesso autenticado já utilizado para gerenciar `members` e restringe os registros de ponto ao proprietário, com validação de vínculo na criação, horários do servidor e entrada/saída atômicas. Como o cadastro de membros continua editável por usuários autenticados, ele pressupõe contas internas confiáveis; não é um sistema de administração com níveis de acesso.

## Estrutura
```text
sig-npca/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.js
│   │   ├── page.js
│   │   └── login/
│   ├── components/
│   │   ├── AuthGuard.js
│   │   ├── MemberModal.js
│   │   ├── Navbar.js
│   │   └── OrgChart.js
│   ├── organization.js
│   └── firebase.js
├── .env.local.example
├── .gitignore
├── jsconfig.json
├── eslint.config.mjs
├── package.json
└── README.md
```

## Ponto e atividades da Orientação
A página `/ponto` permite a assessores, orientadores e ao diretor ativos da Diretoria de Orientação registrar entrada, salvar relatos e registrar saída. O e-mail da conta deve corresponder a exatamente um membro cadastrado. Cada usuário consulta e edita apenas os próprios registros, com calendário mensal, conteúdo passado, atividades e observações. Entrada e saída usam o relógio do servidor e o calendário considera America/Sao_Paulo. A duração mensal soma os registros concluídos pela data de entrada.

A API `/api/ponto` usa apenas Firebase Auth e o SDK comum do Firestore, com a sessão do usuário. Os registros ficam em `orientationAttendance` e `orientationAttendanceActive`. Novos registros incluem `memberId`, referenciando `members`, e os horários usam `serverTimestamp()` do Firestore. A leitura continua compatível com horários ISO dos registros anteriores. O relatório pode ser atualizado posteriormente; horários de entrada e saída não podem ser editados pela página.
