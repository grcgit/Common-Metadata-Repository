(ns cmr.umm-spec.test.versioning
  (:require [clojure.test :refer :all]
            [cmr.common.mime-types :as mt]
            [cmr.common.test.test-check-ext :as ext :refer [defspec]]
            [cmr.umm-spec.versioning :as v]
            [cmr.umm-spec.test.umm-generators :as umm-gen]
            [clojure.test.check.generators :as gen]
            [com.gfredericks.test.chuck.clojure-test :refer [for-all]]
            [cmr.umm-spec.core :as core]))

(deftest test-version-steps
  (with-redefs [cmr.umm-spec.versioning/versions ["1.0" "1.1" "1.2" "1.3"]]
    (is (= [] (v/version-steps "1.2" "1.2")))
    (is (= [["1.1" "1.2"] ["1.2" "1.3"]] (v/version-steps "1.1" "1.3")))
    (is (= [["1.2" "1.1"] ["1.1" "1.0"]] (v/version-steps "1.2" "1.0")))))

(defspec all-migrations-produce-valid-umm-spec 100
  (for-all [umm-record   (gen/no-shrink umm-gen/umm-c-generator)
            dest-version (gen/elements v/versions)]
    (let [dest-media-type (str mt/umm-json "; version=" dest-version)
          metadata (core/generate-metadata umm-record dest-media-type)]
      (empty? (core/validate-metadata :collection dest-media-type metadata)))))

(deftest migrate-1_0-up-to-1_1
  (is (nil?
        (:TilingIdentificationSystems
          (v/migrate-umm :collection "1.0" "1.1"
                         {:TilingIdentificationSystem nil}))))
  (is (= [{:TilingIdentificationSystemName "foo"}]
         (:TilingIdentificationSystems
           (v/migrate-umm :collection "1.0" "1.1"
                          {:TilingIdentificationSystem {:TilingIdentificationSystemName "foo"}})))))

(deftest migrate-1_1-down-to-1_0
  (is (nil?
        (:TilingIdentificationSystem
          (v/migrate-umm :collection "1.1" "1.0"
                         {:TilingIdentificationSystems nil}))))
  (is (nil?
        (:TilingIdentificationSystem
          (v/migrate-umm :collection "1.1" "1.0"
                         {:TilingIdentificationSystems []}))))
  (is (= {:TilingIdentificationSystemName "foo"}
         (:TilingIdentificationSystem
           (v/migrate-umm :collection "1.1" "1.0"
                          {:TilingIdentificationSystems [{:TilingIdentificationSystemName "foo"}
                                                         {:TilingIdentificationSystemName "bar"}]})))))