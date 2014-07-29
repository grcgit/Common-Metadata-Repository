(ns cmr.system-int-test.search.collection-identifier-search-test
  "Tests searching for collections using basic collection identifiers"
  (:require [clojure.test :refer :all]
            [clojure.string :as s]
            [cmr.common.services.messages :as msg]
            [cmr.system-int-test.utils.ingest-util :as ingest]
            [cmr.system-int-test.utils.search-util :as search]
            [cmr.system-int-test.utils.index-util :as index]
            [cmr.system-int-test.data2.collection :as dc]
            [cmr.system-int-test.data2.core :as d]))


(use-fixtures :each (ingest/reset-fixture "PROV1" "PROV2"))


(deftest identifier-search-test

  ;; Create 4 collections in each provider that are identical.
  ;; The first collection will have data:
  ;; {:entry-id "S1_V1", :entry-title "ET1", :short-name "S1", :version-id "V1"}
  (let [[c1-p1 c2-p1 c3-p1 c4-p1
         c1-p2 c2-p2 c3-p2 c4-p2] (for [p ["PROV1" "PROV2"]
                                        n (range 1 5)]
                                    (d/ingest p (dc/collection
                                                  {:short-name (str "S" n)
                                                   :version-id (str "V" n)
                                                   :entry-title (str "ET" n)})))
        all-prov1-colls [c1-p1 c2-p1 c3-p1 c4-p1]
        all-prov2-colls [c1-p2 c2-p2 c3-p2 c4-p2]
        all-colls (concat all-prov1-colls all-prov2-colls)]
    (index/refresh-elastic-index)

    (testing "concept id"
      (are [items ids]
           (d/refs-match? items (search/find-refs :collection {:concept-id ids}))

           [c1-p1] (:concept-id c1-p1)
           [c1-p2] (:concept-id c1-p2)
           [c1-p1 c1-p2] [(:concept-id c1-p1) (:concept-id c1-p2)]
           [c1-p1] [(:concept-id c1-p1) "C2200-PROV1"]
           [c1-p1] [(:concept-id c1-p1) "FOO"]
           [] "FOO"))

    (testing "provider"
      (are [items p options]
           (let [params (merge {:provider p}
                               (when options
                                 {"options[provider]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           all-prov1-colls "PROV1" {}
           all-prov2-colls "PROV2" {}
           [] "PROV3" {}

           ;; Multiple values
           all-colls ["PROV1" "PROV2"] {}
           all-prov1-colls ["PROV1" "PROV3"] {}
           all-colls ["PROV1" "PROV2"] {:and false}
           [] ["PROV1" "PROV2"] {:and true}

           ;; Wildcards
           all-colls "PROV*" {:pattern true}
           [] "PROV*" {:pattern false}
           [] "PROV*" {}
           all-prov1-colls "*1" {:pattern true}
           all-prov1-colls "P?OV1" {:pattern true}
           [] "*Q*" {:pattern true}

           ;; Ignore case
           all-prov1-colls "pRoV1" {:ignore-case true}
           [] "prov1" {:ignore-case false})

      (testing "legacy catalog rest parameter name"
        (is (d/refs-match? all-prov1-colls (search/find-refs :collection {:provider-id "PROV1"})))))

    (testing "short name"
      (are [items sn options]
           (let [params (merge {:short-name sn}
                               (when options
                                 {"options[short-name]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           [c1-p1 c1-p2] "S1" {}
           [] "S44" {}
           ;; Multiple values
           [c1-p1 c1-p2 c2-p1 c2-p2] ["S1" "S2"] {}
           [c1-p1 c1-p2] ["S1" "S44"] {}
           [c1-p1 c1-p2 c2-p1 c2-p2] ["S1" "S2"] {:and false}
           [] ["S1" "S2"] {:and true}

           ;; Wildcards
           all-colls "S*" {:pattern true}
           [] "S*" {:pattern false}
           [] "S*" {}
           [c1-p1 c1-p2] "*1" {:pattern true}
           [c1-p1 c1-p2] "?1" {:pattern true}
           [] "*Q*" {:pattern true}

           ;; Ignore case
           [c1-p1 c1-p2] "s1" {:ignore-case true}
           [] "s1" {:ignore-case false}))

    (testing "version"
      (are [items v options]
           (let [params (merge {:version v}
                               (when options
                                 {"options[version]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           [c1-p1 c1-p2] "V1" {}
           [] "V44" {}
           ;; Multiple values
           [c1-p1 c1-p2 c2-p1 c2-p2] ["V1" "V2"] {}
           [c1-p1 c1-p2] ["V1" "V44"] {}
           [c1-p1 c1-p2 c2-p1 c2-p2] ["V1" "V2"] {:and false}
           [] ["V1" "V2"] {:and true}

           ;; Wildcards
           all-colls "V*" {:pattern true}
           [] "V*" {:pattern false}
           [] "V*" {}
           [c1-p1 c1-p2] "*1" {:pattern true}
           [c1-p1 c1-p2] "?1" {:pattern true}
           [] "*Q*" {:pattern true}

           ;; Ignore case
           [c1-p1 c1-p2] "v1" {:ignore-case true}
           [] "v1" {:ignore-case false}))

    (testing "entry id"
      (are [items ids options]
           (let [params (merge {:entry-id ids}
                               (when options
                                 {"options[entry-id]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           [c1-p1 c1-p2] "S1_V1" {}
           [] "S44_V44" {}
           ;; Multiple values
           [c1-p1 c1-p2 c2-p1 c2-p2] ["S1_V1" "S2_V2"] {}
           [c1-p1 c1-p2] ["S1_V1" "S44_V44"] {}
           [c1-p1 c1-p2 c2-p1 c2-p2] ["S1_V1" "S2_V2"] {:and false}
           [] ["S1_V1" "S2_V2"] {:and true}

           ;; Wildcards
           all-colls "S*_V*" {:pattern true}
           [] "S*_V*" {:pattern false}
           [] "S*_V*" {}
           [c1-p1 c1-p2] "*1" {:pattern true}
           [c1-p1 c1-p2] "S1_?1" {:pattern true}
           [] "*Q*" {:pattern true}

           ;; Ignore case
           [c1-p1 c1-p2] "S1_v1" {:ignore-case true}
           [] "S1_v1" {:ignore-case false}))

    (testing "Entry title"
      (are [items v options]
           (let [params (merge {:entry-title v}
                               (when options
                                 {"options[entry-title]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           [c1-p1 c1-p2] "ET1" {}
           [] "ET44" {}
           ;; Multiple values
           [c1-p1 c1-p2 c2-p1 c2-p2] ["ET1" "ET2"] {}
           [c1-p1 c1-p2] ["ET1" "ET44"] {}
           [c1-p1 c1-p2 c2-p1 c2-p2] ["ET1" "ET2"] {:and false}
           [] ["ET1" "ET2"] {:and true}

           ;; Wildcards
           all-colls "ET*" {:pattern true}
           [] "ET*" {:pattern false}
           [] "ET*" {}
           [c1-p1 c1-p2] "*1" {:pattern true}
           [c1-p1 c1-p2] "?T1" {:pattern true}
           [] "*Q*" {:pattern true}

           ;; Ignore case
           [c1-p1 c1-p2] "et1" {:ignore-case true}
           [] "et1" {:ignore-case false})

      (is (d/refs-match?
            [c1-p1 c1-p2]
            (search/find-refs :collection {:dataset-id "ET1"}))
          "dataset_id should be an alias for entry title."))

    (testing "unsupported parameter"
      (is (= {:status 422,
              :errors ["Parameter [unsupported] was not recognized."]}
             (search/find-refs :collection {:unsupported "dummy"})))
      (is (= {:status 422,
              :errors ["Parameter [unsupported] with option was not recognized."]}
             (search/find-refs :collection {"options[unsupported][ignore-case]" true})))
      (is (= {:status 422,
              :errors ["Option [unsupported] for param [entry_title] was not recognized."]}
             (search/find-refs
               :collection
               {:entry-title "dummy" "options[entry-title][unsupported]" "unsupported"}))))))

;; Create 2 collection sets of which only 1 set has processing-level-id
(deftest processing-level-search-test
  (let [[c1-p1 c2-p1 c3-p1 c4-p1] (for [n (range 1 5)]
                                    (d/ingest "PROV1" (dc/collection {})))
        ;; include processing level id
        [c1-p2 c2-p2 c3-p2 c4-p2] (for [n (range 1 5)]
                                    (d/ingest "PROV2" (dc/collection {:processing-level-id (str n "B")})))
        all-prov2-colls [c1-p2 c2-p2 c3-p2 c4-p2]]
    (index/refresh-elastic-index)
    (testing "processing level search"
      (are [items id options]
           (let [params (merge {:processing-level-id id}
                               (when options
                                 {"options[processing-level-id]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           [c1-p2] "1B" {}
           [] "1C" {}
           ;; Multiple values
           [c1-p2 c2-p2 c3-p2] ["1B" "2B" "3B"] {}
           [c4-p2] ["4B" "4C"] {}
           [c1-p2 c2-p2 c3-p2] ["1B" "2B" "3B"] {:and false}
           [] ["B1" "B2"] {:and true}

           ;; Wildcards
           all-prov2-colls "*B" {:pattern true}
           [] "B*" {:pattern false}
           [] "B*" {}
           all-prov2-colls "?B" {:pattern true}
           [] "*Q*" {:pattern true}

           ;; Ignore case
           [c2-p2] "2b" {:ignore-case true}
           [] "2b" {:ignore-case false}))))

;; Find collections by echo_collection_id and concept_id params
(deftest echo-coll-id-search-test
  (let [[c1-p1 c2-p1 c3-p1 c4-p1
         c1-p2 c2-p2 c3-p2 c4-p2] (for [p ["PROV1" "PROV2"]
                                        n (range 1 5)]
                                    (d/ingest p (dc/collection {})))
        c1-p1-cid (get-in c1-p1 [:concept-id])
        c2-p1-cid (get-in c2-p1 [:concept-id])
        c3-p2-cid (get-in c3-p2 [:concept-id])
        c4-p2-cid (get-in c4-p2 [:concept-id])
        dummy-cid "D1000000004-PROV2"
        all-prov1-colls [c1-p1 c2-p1 c3-p1 c4-p1]
        all-prov2-colls [c1-p2 c2-p2 c3-p2 c4-p2]
        all-colls (concat all-prov1-colls all-prov2-colls)]
    (index/refresh-elastic-index)
    (testing "echo collection id search"
      (are [items cid options]
           (let [params (merge {:echo_collection_id cid}
                               (when options
                                 {"options[echo_collection_id]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           [c1-p1] c1-p1-cid {}
           [c3-p2] c3-p2-cid {}
           [] dummy-cid {}
           ;; Multiple values
           [c1-p1 c2-p1 c3-p2 c4-p2] [c1-p1-cid c2-p1-cid c3-p2-cid c4-p2-cid dummy-cid] {}
           [c1-p1 c3-p2] [c1-p1-cid  c3-p2-cid] {:and false}
           [] [c1-p1-cid  c3-p2-cid] {:and true}))
    (testing "echo collection id search - disallow ignore case"
      (is (= {:status 422
              :errors [(msg/invalid-ignore-case-opt-setting-msg #{:concept-id :echo-collection-id :echo-granule-id})]}
             (search/find-refs :granule {:echo_collection_id c2-p1-cid "options[echo_collection_id]" {:ignore_case true}}))))
    (testing "Search with wildcards in echo_collection_id param not supported."
      (is (= {:status 422
              :errors [(msg/invalid-pattern-opt-setting-msg #{:concept-id :echo-collection-id :echo-granule-id})]}
             (search/find-refs :granule {:echo_collection_id "C*" "options[echo_collection_id]" {:pattern true}}))))
    (testing "concept id search"
      ;; skipping some test conditions because concept_id search is similar in behavior to above echo_collection_id search
      (are [items cid options]
           (let [params (merge {:concept_id cid}
                               (when options
                                 {"options[concept_id]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           [c1-p1] c1-p1-cid {}
           [c3-p2] c3-p2-cid {}
           [] dummy-cid {}
           ;; Multiple values
           [c1-p1 c2-p1 c3-p2 c4-p2] [c1-p1-cid c2-p1-cid c3-p2-cid c4-p2-cid dummy-cid] {}
           [] [c1-p1-cid  c3-p2-cid] {:and true}))
    (testing "Search with wildcards in concep_id param not supported."
      (is (= {:status 422
              :errors [(msg/invalid-pattern-opt-setting-msg #{:concept-id :echo-collection-id :echo-granule-id})]}
             (search/find-refs :granule {:concept_id "C*" "options[concept_id]" {:pattern true}}))))))

(deftest dif-entry-id-search-test
  (let [coll1 (d/ingest "PROV1" (dc/collection {:short-name "S1"
                                                :version-id "V1"}))
        coll2 (d/ingest "PROV1" (dc/collection {:entry-id "S2"}) :dif)
        coll3 (d/ingest "PROV2" (dc/collection {:associated-difs ["S3"]}))
        coll4 (d/ingest "PROV2" (dc/collection {:associated-difs ["SL4" "DIF-1"]}))
        coll5 (d/ingest "PROV2" (dc/collection {:entry-id "T2"}) :dif)]
    (index/refresh-elastic-index)
    (testing "dif entry id search"
      (are [items id options]
           (let [params (merge {:dif-entry-id id}
                               (when options
                                 {"options[dif-entry-id]" options}))]
             (d/refs-match? items (search/find-refs :collection params)))

           [coll1] "S1_V1" {}
           [coll2] "S2" {}
           [coll3] "S3" {}
           [] "S1" {}
           ;; Multiple values
           [coll2 coll3] ["S2" "S3"] {}
           [coll4] ["SL4" "DIF-1"] {}
           [coll2 coll3] ["S2" "S3"] {:and false}
           [] ["S2" "S3"] {:and true}

           ;; Wildcards
           [coll1 coll2 coll3 coll4] "S*" {:pattern true}
           [] "S*" {:pattern false}
           [] "S*" {}
           [coll2 coll3] "S?" {:pattern true}
           [] "*Q*" {:pattern true}

           ;; Ignore case
           [coll2] "s2" {:ignore-case true}
           [] "s2" {:ignore-case false}))))
